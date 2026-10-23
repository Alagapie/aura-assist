/**
 * The 3D simulator as the home's camera.
 *
 * AuraAssist's vision tool needs a real frame to analyse. The 3D scene *is* the
 * camera system, so this service grabs the current canvas image and posts it to
 * the server's /vision/describe endpoint. The server then runs the Nova VLM on
 * exactly what the user is looking at, and stores what it sees as sightings -
 * which is what makes "where are my keys?" work later.
 *
 * Frames are posted when the view settles (room change), not every animation
 * frame, so we spend one VLM call per look rather than one per rendered frame.
 */

import { apiUrl } from './auraConnection'

/* Longest edge of a posted frame. A 1.8x-DPR canvas on a large monitor is
   3000+ px wide - several MB of base64 per look - while the VLM gains nothing
   past this size. */
const MAX_FRAME_EDGE = 1600

/* Zoomed views sent alongside the whole frame: four overlapping quarters
   (x, y as fractions of the frame, each TILE_SPAN wide). A phone or a set of
   keys is a few dozen pixels in a whole-room shot; in a quarter it is twice
   the size, which is the difference between "a book" and "a phone and a book". */
const TILE_SPAN = 0.6
const TILE_ORIGINS = [[0, 0], [0.4, 0], [0, 0.4], [0.4, 0.4]]

const sceneCanvas = () => document.querySelector('.canvas-wrap canvas') || document.querySelector('canvas')

/** Copy a region of `canvas` into a JPEG data URL no larger than MAX_FRAME_EDGE.
 *  With `fill`, a smaller region is enlarged to that size: measured on the
 *  living room, upscaled tiles took phone detection from 2/5 to 5/5. */
function encodeRegion(canvas, sx, sy, sw, sh, quality, fill = false) {
  const fit = MAX_FRAME_EDGE / Math.max(sw, sh)
  const scale = fill ? fit : Math.min(1, fit)
  const out = document.createElement('canvas')
  out.width = Math.round(sw * scale)
  out.height = Math.round(sh * scale)
  const ctx = out.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height)
  return out.toDataURL('image/jpeg', quality)
}

/** Grab the WebGL canvas as a JPEG data URL. Returns null if there is no frame. */
export function captureCanvas(quality = 0.85) {
  const canvas = sceneCanvas()
  if (!canvas || !canvas.width || !canvas.height) return null
  try {
    return encodeRegion(canvas, 0, 0, canvas.width, canvas.height, quality)
  } catch {
    return null
  }
}

/** The four zoomed quarters of the current frame, as JPEG data URLs. */
export function captureTiles(quality = 0.85) {
  const canvas = sceneCanvas()
  if (!canvas || !canvas.width || !canvas.height) return []
  const { width: w, height: h } = canvas
  try {
    return TILE_ORIGINS.map(([x, y]) =>
      encodeRegion(canvas, Math.round(x * w), Math.round(y * h), Math.round(TILE_SPAN * w), Math.round(TILE_SPAN * h), quality, true))
  } catch {
    return []
  }
}

/** Resolve after `count` animation frames - i.e. after the scene has really
 *  been re-rendered. A newly shown room compiles its shaders on its first
 *  frame, which can stall rendering well past any fixed delay. */
const afterFrames = (count) => new Promise((resolve) => {
  const step = (left) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)))
  step(count)
})

/**
 * Post one frame for `cameraId`. Returns the vision result, or null on failure
 * (the server being offline must never break the 3D view).
 */
export async function describeView(cameraId, dataUrl, onStatus) {
  const image = dataUrl || captureCanvas()
  if (!image) {
    onStatus?.({ state: 'error', detail: 'No simulator canvas frame is available' })
    return null
  }
  const base64 = image.split(',')[1]
  if (!base64) {
    onStatus?.({ state: 'error', detail: 'Simulator canvas returned an invalid image' })
    return null
  }
  // Zoomed tiles only make sense for the live canvas, not a caller's picture.
  const tiles = dataUrl ? [] : captureTiles().map((t) => t.split(',')[1]).filter(Boolean)

  try {
    const res = await fetch(apiUrl('/vision/describe'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ camera_id: cameraId, image_base64: base64, tiles_base64: tiles, mime: 'image/jpeg' }),
    })
    if (!res.ok) {
      onStatus?.({ state: 'error', detail: `Camera upload failed (HTTP ${res.status})` })
      return null
    }
    const body = await res.json()
    if (body.error) {
      onStatus?.({ state: 'error', detail: `Vision server: ${body.error}` })
      return null
    }
    onStatus?.({ state: 'online', detail: `Camera frame received for ${cameraId}` })
    return body
  } catch (error) {
    onStatus?.({ state: 'error', detail: `Camera upload could not reach ${apiUrl('/vision/describe')}: ${error.message}` })
    return null
  }
}

/**
 * Watch the store's room and post a frame whenever the view changes.
 *
 * `getView()` returns `{ room, key }`: `room` is the camera id the current
 * picture shows, or null when it shows no single room (overview, floor plan) -
 * posting that picture as "living" would teach the VLM the wrong room. `key`
 * changes whenever the framing does (another room, another preset angle), so
 * a new angle of the same room is looked at too.
 *
 * Returns a stop function. Callers (App) wire it up once; it no-ops safely when
 * the server is unreachable, so the simulator stays fully usable offline.
 */
export function watchCamera({ getView, onStatus, intervalMs = 1500, settleMs = 1400, retryMs = 5000, followUpMs = 6000, refreshMs = 30000 } = {}) {
  let stopped = false
  let lastKey = null
  let nextAttemptAt = 0
  let sending = false

  const tick = async () => {
    if (stopped || sending) return
    const { room, key } = getView?.() || {}
    const viewChanged = room && key !== lastKey
    if (!room || (!viewChanged && Date.now() < nextAttemptAt)) return
    sending = true
    try {
      // Wait for the camera tween to land before grabbing the frame.
      if (viewChanged) await new Promise((r) => window.setTimeout(r, settleMs))
      await afterFrames(3)
      if (stopped) return
      // The view may have moved on while we waited - grab it next tick.
      if (getView?.()?.key !== key) return
      // Remember the attempted view so a failure obeys retryMs instead of
      // treating every interval tick as a new view change.
      lastKey = key
      onStatus?.({ state: 'sending', detail: `Sending ${room} camera frame` })
      const result = await describeView(room, undefined, onStatus)
      // A failed first request must not permanently suppress this room. Also
      // refresh occasionally so later voice searches use a recent frame after
      // a server restart or reconnect while the user stays in the same room.
      // The first look after a view change is repeated soon after, in case
      // textures were still streaming in; an unchanged picture is answered
      // from the server's cache without another VLM call.
      if (result) {
        nextAttemptAt = Date.now() + (viewChanged ? followUpMs : refreshMs)
      } else {
        nextAttemptAt = Date.now() + retryMs
      }
    } finally {
      sending = false
    }
  }

  const timer = window.setInterval(tick, intervalMs)
  tick()
  return () => {
    stopped = true
    window.clearInterval(timer)
  }
}
