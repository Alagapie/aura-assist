import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useRoomStore } from '../store/useRoomStore'
import {
  ROOMS, OVERVIEW_CAMERA, FLOORPLAN_CAMERA, HOUSE_BOUNDS, DEFAULT_FOV, roomViewPreset,
} from '../config/house'

/**
 * Camera navigation for the orbit / overview / floor-plan views.
 *
 * The store owns *where* the camera should look (`cameraView = { mode, roomId,
 * nonce }`); this rig owns *how* it gets there. Whenever the nonce changes it
 * tweens the camera position and the orbit target to the new preset, then hands
 * control back to the user.
 *
 * Scrolling the environment is intentionally seamless:
 *   - wheel zoom is *damped* (OrbitControls' built-in zoom snaps a fixed step
 *     per notch), so the camera glides toward the wheel's accumulated target
 *     instead of jumping;
 *   - the wheel range is the same in every view, so pulling back from a room
 *     glides all the way out to the whole-house view without an abrupt stop;
 *   - the orbit target is kept inside the house envelope, so panning can never
 *     fling the look-at point into the void behind the single-sided walls;
 *   - the wheel and the mouse interrupt an in-flight fly-in instead of being
 *     swallowed, so input always lands immediately.
 */

const TWEEN_MS = 1000
/** Viewpoint changes *within* one room are local reframes, so they are quicker. */
const VIEW_TWEEN_MS = 620
const ZOOM_STEP = 1.1 // distance multiplier per wheel notch
const ZOOM_DAMP = 10 // how quickly the camera eases toward the wheel's target

/** Scratch vectors reused every frame (avoid per-frame allocation). */
const _ray = new THREE.Vector3()
const _fwd = new THREE.Vector3()

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2)

/**
 * Per-view orbit limits. `maxDistance` is deliberately roomy everywhere so a
 * single continuous scroll can travel from a close-up inside one room out to
 * the whole house; the limits only stop the camera from entering a wall
 * (`minDistance`) or dropping below the floor (`minPolarAngle`).
 */
const LIMITS = {
  room: { minDistance: 1.4, maxDistance: 60, minPolarAngle: 0.05, maxPolarAngle: 1.5 },
  overview: { minDistance: 5, maxDistance: 60, minPolarAngle: 0.05, maxPolarAngle: 1.5 },
  floorplan: { minDistance: 6, maxDistance: 70, minPolarAngle: 0.001, maxPolarAngle: 0.35 },
}

/**
 * Limits for the isolated room view. The rest of the house and the entire
 * exterior are hidden here (see HouseShell), so the camera is free to leave the
 * room and orbit around it: close enough to inspect a detail, far enough to
 * frame the whole room, and never under the floor or over the walls.
 */
const SOLO_LIMITS = { minDistance: 0.8, maxDistance: 12, minPolarAngle: 0.05, maxPolarAngle: 1.5 }

/** Neutral studio backdrop used while a single room is isolated. */
const SOLO_BACKGROUND = new THREE.Color('#242a32')

/**
 * Scroll distance at which the navigation label flips between a single room
 * and the whole-house overview. The two thresholds overlap (hysteresis) so the
 * label does not flicker while the camera sits near the boundary.
 */
const OVERVIEW_ENTER = 17
const OVERVIEW_LEAVE = 15

/**
 * The look-at point may only move around inside the house, so panning always
 * frames something real. Y is capped below ceiling height: you orbit over the
 * floor, never up into the roof.
 */
const TARGET_BOUNDS = {
  minX: HOUSE_BOUNDS.minX, maxX: HOUSE_BOUNDS.maxX,
  minY: 0, maxY: 2.2,
  minZ: HOUSE_BOUNDS.minZ, maxZ: HOUSE_BOUNDS.maxZ,
}

const presetFor = (mode, roomId, viewIndex = 0) => {
  if (mode === 'overview') return OVERVIEW_CAMERA
  if (mode === 'floorplan') return FLOORPLAN_CAMERA
  return roomViewPreset(roomId, viewIndex)
}

export function CameraRig() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const controls = useRef()
  const tween = useRef(null)
  const desired = useRef(null) // smoothed wheel-zoom distance
  const cursor = useRef(null) // last cursor NDC, for zoom-to-cursor
  const limitsRef = useRef(LIMITS.room)
  const initialised = useRef(false)

  const cameraView = useRoomStore((s) => s.cameraView)
  const view = useRoomStore((s) => s.view)
  const cameraMode = useRoomStore((s) => s.cameraMode)
  const roomIsolation = useRoomStore((s) => s.roomIsolation)
  const zoomTick = useRoomStore((s) => s.zoomTick)

  /* Is a single room being shown on its own? Then the camera may leave the room
   * to orbit it, and the zoom range is the room-scale one. */
  const solo = cameraMode === 'orbit' && view === 'room' && roomIsolation
  const limits = solo ? SOLO_LIMITS : (LIMITS[view] || LIMITS.room)
  limitsRef.current = limits

  // Remember the previous destination so a viewpoint change *within* a room can
  // use a shorter, local reframe instead of a slow house-wide sweep.
  const prevDest = useRef({ mode: 'room', roomId: 'living', viewIndex: 0 })

  useEffect(() => {
    const preset = presetFor(cameraView.mode, cameraView.roomId, cameraView.viewIndex)
    const toPos = new THREE.Vector3(...preset.position)
    const toTarget = new THREE.Vector3(...preset.target)
    const toFov = preset.fov ?? DEFAULT_FOV
    const c = controls.current

    const prev = prevDest.current
    const sameRoom = prev.mode === 'room' && cameraView.mode === 'room' && prev.roomId === cameraView.roomId
    prevDest.current = { mode: cameraView.mode, roomId: cameraView.roomId, viewIndex: cameraView.viewIndex }

    // First mount: snap straight to the preset, no fly-in.
    if (!initialised.current || !c) {
      camera.position.copy(toPos)
      camera.fov = toFov
      camera.updateProjectionMatrix()
      desired.current = toPos.distanceTo(toTarget)
      if (c) {
        c.target.copy(toTarget)
        c.update()
      }
      initialised.current = true
      return
    }

    // With containment on, entering a room is a clean cut rather than a fly-in
    // across the whole house (a fly-in would sweep through the other rooms).
    // Viewpoint changes *within* the room still animate, since they stay inside.
    const contained = useRoomStore.getState().roomIsolation
    if (contained && cameraView.mode === 'room' && !sameRoom) {
      tween.current = null
      camera.position.copy(toPos)
      camera.fov = toFov
      camera.updateProjectionMatrix()
      c.target.copy(toTarget)
      c.update()
      desired.current = toPos.distanceTo(toTarget)
      return
    }

    tween.current = {
      fromPos: camera.position.clone(),
      toPos,
      fromTarget: c.target.clone(),
      toTarget,
      fromFov: camera.fov,
      toFov,
      t0: now(),
      ms: sameRoom ? VIEW_TWEEN_MS : TWEEN_MS,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraView.nonce, camera, cameraView.mode, cameraView.roomId, cameraView.viewIndex])

  /**
   * Hand control to the user mid-flight: drop the tween where it is and adopt
   * the current distance as the zoom target, so a scroll during the fly-in
   * keeps gliding instead of snapping.
   */
  const cancelTween = () => {
    if (!tween.current) return
    tween.current = null
    const c = controls.current
    if (c) desired.current = camera.position.distanceTo(c.target)
  }

  // Wheel zoom: replace OrbitControls' stepped dolly with a damped target.
  useEffect(() => {
    const el = gl?.domElement
    if (!el) return undefined
    const onWheel = (event) => {
      event.preventDefault()
      cancelTween()
      const c = controls.current
      if (!c) return
      // Remember where the cursor is so the dolly glides toward that point
      // (zoom-to-cursor) instead of the screen centre.
      const rect = el.getBoundingClientRect()
      if (rect.width && rect.height) {
        cursor.current = {
          x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
          y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
        }
      }
      if (desired.current == null) desired.current = camera.position.distanceTo(c.target)
      const raw = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      const steps = THREE.MathUtils.clamp(raw, -240, 240) / 100
      const l = limitsRef.current
      desired.current = THREE.MathUtils.clamp(
        desired.current * Math.pow(ZOOM_STEP, steps),
        l.minDistance,
        l.maxDistance,
      )
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [gl, camera])

  // On-screen +/- zoom buttons and keyboard shortcuts land here: nudge the same
  // damped distance target the wheel drives, centred on the screen.
  useEffect(() => {
    if (!zoomTick.nonce) return
    cancelTween()
    const c = controls.current
    if (!c) return
    if (desired.current == null) desired.current = camera.position.distanceTo(c.target)
    const l = limitsRef.current
    cursor.current = null // button zoom stays centred, unlike cursor zoom
    desired.current = THREE.MathUtils.clamp(
      desired.current * Math.pow(ZOOM_STEP, -zoomTick.dir * 3),
      l.minDistance,
      l.maxDistance,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomTick.nonce])

  // A pointer press means the user is orbiting/panning: release the fly-in.
  useEffect(() => {
    const el = gl?.domElement
    if (!el) return undefined
    const onDown = () => cancelTween()
    el.addEventListener('pointerdown', onDown)
    return () => el.removeEventListener('pointerdown', onDown)
  }, [gl])

  useFrame((_, delta) => {
    const c = controls.current
    if (!c) return

    const t = tween.current
    if (t) {
      const k = Math.min(1, (now() - t.t0) / (t.ms || TWEEN_MS))
      const e = easeInOutCubic(k)
      camera.position.lerpVectors(t.fromPos, t.toPos, e)
      c.target.lerpVectors(t.fromTarget, t.toTarget, e)
      if (t.toFov != null && Math.abs(camera.fov - t.toFov) > 1e-4) {
        camera.fov = THREE.MathUtils.lerp(t.fromFov ?? camera.fov, t.toFov, e)
        camera.updateProjectionMatrix()
      }
      if (k >= 1) {
        tween.current = null
        desired.current = camera.position.distanceTo(c.target)
      }
    } else if (desired.current != null) {
      // Ease the camera radius toward the wheel's accumulated target. The
      // camera translates along the ray through the cursor, so the point under
      // the pointer stays put (zoom-to-cursor); the orbit target is then placed
      // at the new distance straight ahead.
      const current = camera.position.distanceTo(c.target)
      if (current > 1e-4) {
        const want = THREE.MathUtils.clamp(desired.current, limitsRef.current.minDistance, limitsRef.current.maxDistance)
        if (Math.abs(want - current) > 1e-3) {
          const next = THREE.MathUtils.damp(current, want, ZOOM_DAMP, delta)
          const ndc = cursor.current
          if (ndc) {
            _ray.set(ndc.x, ndc.y, 1).unproject(camera).sub(camera.position).normalize()
          } else {
            _ray.subVectors(camera.position, c.target).normalize()
          }
          camera.position.addScaledVector(_ray, current - next)
          camera.getWorldDirection(_fwd)
          c.target.copy(camera.position).addScaledVector(_fwd, next)
        } else {
          desired.current = want
        }
      }
    }

    c.update()

    // Look-at bounds. In the isolated room view the target is kept inside the
    // room being framed, so pulling back always stays centred on that room; the
    // camera itself is deliberately NOT clamped any more. HouseShell hides every
    // other room and the whole exterior for that view, so the camera can orbit
    // and pull back all the way around the room and still never reveal the
    // outside. Everywhere else the look-at point merely stays inside the house.
    const state = useRoomStore.getState()
    const isolateNow = state.cameraMode === 'orbit' && state.view === 'room' && state.roomIsolation
    const room = isolateNow ? (ROOMS[state.currentRoom] || ROOMS.living) : null
    const tb = room
      ? { minX: room.x0, maxX: room.x1, minY: 0, maxY: 2.2, minZ: room.z0, maxZ: room.z1 }
      : TARGET_BOUNDS
    c.target.x = THREE.MathUtils.clamp(c.target.x, tb.minX, tb.maxX)
    c.target.y = THREE.MathUtils.clamp(c.target.y, tb.minY, tb.maxY)
    c.target.z = THREE.MathUtils.clamp(c.target.z, tb.minZ, tb.maxZ)

    // Swap the sky dome for a neutral studio backdrop while a room is isolated.
    const backdrop = room ? SOLO_BACKGROUND : null
    if (scene.background !== backdrop) scene.background = backdrop

    // Keep the room switcher honest: scrolling out of a room into the wider
    // house highlights "Overview", scrolling back in highlights the room. With
    // containment on, a room can only be entered deliberately (via the room
    // tabs), so we never flip mid-scroll into a room and snap the camera in.
    if (!tween.current) {
      const distance = camera.position.distanceTo(c.target)
      // While containment is on, a room stays a room: scrolling can never pull
      // the camera - or the label - out to the whole-house view. You leave a
      // room deliberately, with the Overview button or the floor plan.
      if (state.view === 'room' && !state.roomIsolation && distance > OVERVIEW_ENTER) state.setView('overview')
      else if (state.view === 'overview' && !state.roomIsolation && distance < OVERVIEW_LEAVE) state.setView('room')
    }
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.09}
      enableZoom={false} // wheel zoom is handled above so it can be damped
      enablePan
      panSpeed={0.7}
      rotateSpeed={0.75}
      {...limits}
    />
  )
}
