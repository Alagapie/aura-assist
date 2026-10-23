import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * Creates a canvas-backed texture and keeps it redrawn.
 *
 * @param {number} width  canvas width in pixels
 * @param {number} height canvas height in pixels
 * @param {(ctx: CanvasRenderingContext2D, t: number) => void} draw
 * @param {Array} deps       re-draw immediately whenever these change
 * @param {number} fps       animation rate; 0 means "only on dependency change"
 * @param {object} options   { srgb, filtering }
 */
export function useCanvasTexture(width, height, draw, deps = [], fps = 0, options = {}) {
  const { srgb = true } = options

  const { canvas, texture } = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    const t = new THREE.CanvasTexture(c)
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    t.minFilter = THREE.LinearFilter
    t.magFilter = THREE.LinearFilter
    t.generateMipmaps = false
    return { canvas: c, texture: t }
  }, [width, height, srgb])

  const drawRef = useRef(draw)
  drawRef.current = draw

  // redraw on dependency change
  useEffect(() => {
    const ctx = canvas.getContext('2d')
    drawRef.current(ctx, performance.now() / 1000)
    texture.needsUpdate = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, canvas, texture])

  // optional animation loop (throttled)
  useEffect(() => {
    if (!fps) return undefined
    const interval = 1000 / fps
    let raf = 0
    let last = 0
    const loop = (time) => {
      if (time - last >= interval) {
        last = time
        const ctx = canvas.getContext('2d')
        drawRef.current(ctx, time / 1000)
        texture.needsUpdate = true
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fps, canvas, texture])

  useEffect(() => () => texture.dispose(), [texture])

  return texture
}
