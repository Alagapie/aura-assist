import * as THREE from 'three'

/**
 * Small procedural texture factory. Everything is generated on a 2D canvas at
 * runtime, so the project has zero external asset dependencies (no CDN, no
 * downloads) and still gets believable wood, plaster, fabric and sky surfaces.
 */

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return { canvas, ctx: canvas.getContext('2d') }
}

function finish(canvas, { repeat = [1, 1], srgb = true, anisotropy = 4 } = {}) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat[0], repeat[1])
  texture.anisotropy = anisotropy
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

/** Warm oak floor boards. */
export function createWoodTexture({ size = 512, repeat = [3, 3], light = '#b98a5c', dark = '#8b6136' } = {}) {
  const { canvas, ctx } = makeCanvas(size, size)
  const planks = 5
  const plankH = size / planks
  ctx.fillStyle = dark
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < planks; i += 1) {
    const y = i * plankH
    const shade = i % 2 === 0 ? light : '#c9975f'
    ctx.fillStyle = shade
    ctx.fillRect(0, y + 1, size, plankH - 2)

    // grain
    for (let g = 0; g < 46; g += 1) {
      ctx.strokeStyle = `rgba(90,58,32,${0.03 + Math.random() * 0.07})`
      ctx.lineWidth = 0.6 + Math.random() * 1.4
      ctx.beginPath()
      const gy = y + 4 + Math.random() * (plankH - 8)
      ctx.moveTo(0, gy)
      for (let x = 0; x <= size; x += 16) {
        ctx.lineTo(x, gy + Math.sin((x / size) * Math.PI * 3 + g) * 1.6)
      }
      ctx.stroke()
    }

    // board seam + end joints
    ctx.fillStyle = 'rgba(50,32,18,0.55)'
    ctx.fillRect(0, y, size, 2)
    const jointX = ((i * 137) % (size - 60)) + 30
    ctx.fillRect(jointX, y, 2, plankH)
  }
  return finish(canvas, { repeat })
}

/** Subtle plaster / painted wall. */
export function createPlasterTexture({ size = 256, repeat = [2, 2], color = '#e9e3da' } = {}) {
  const { canvas, ctx } = makeCanvas(size, size)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 2600; i += 1) {
    const a = Math.random() * 0.05
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(90,82,70,${a})`
    const r = 1 + Math.random() * 2.5
    ctx.beginPath()
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2)
    ctx.fill()
  }
  return finish(canvas, { repeat })
}

/** Large-format stone/ceramic floor tile with grout lines. */
export function createTileTexture({ size = 512, repeat = [4, 4], base = '#d8d4cc', grout = '#b3ada2' } = {}) {
  const { canvas, ctx } = makeCanvas(size, size)
  const tiles = 4
  const cell = size / tiles
  ctx.fillStyle = grout
  ctx.fillRect(0, 0, size, size)
  for (let ty = 0; ty < tiles; ty += 1) {
    for (let tx = 0; tx < tiles; tx += 1) {
      const x = tx * cell
      const y = ty * cell
      const shade = 0.94 + Math.random() * 0.09
      ctx.fillStyle = shadeColor(base, shade)
      ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4)
      // faint marbling
      ctx.strokeStyle = `rgba(120,112,100,${0.05 + Math.random() * 0.06})`
      ctx.lineWidth = 1
      for (let s = 0; s < 3; s += 1) {
        ctx.beginPath()
        const sy = y + 6 + Math.random() * (cell - 12)
        ctx.moveTo(x + 4, sy)
        ctx.bezierCurveTo(x + cell * 0.3, sy - 6, x + cell * 0.6, sy + 6, x + cell - 4, sy)
        ctx.stroke()
      }
    }
  }
  return finish(canvas, { repeat })
}

/** Multiply a hex colour by a scalar shade factor. */
function shadeColor(hex, factor) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, Math.round(((n >> 16) & 255) * factor))
  const g = Math.min(255, Math.round(((n >> 8) & 255) * factor))
  const b = Math.min(255, Math.round((n & 255) * factor))
  return `rgb(${r},${g},${b})`
}

/** Soft patterned rug. */
export function createRugTexture({ w = 512, h = 384 } = {}) {
  const { canvas, ctx } = makeCanvas(w, h)
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, '#3f5b6b')
  g.addColorStop(0.5, '#54778b')
  g.addColorStop(1, '#2f4753')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  ctx.strokeStyle = 'rgba(240,245,250,0.16)'
  ctx.lineWidth = 2
  for (let i = -h; i < w; i += 34) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i + h, h)
    ctx.stroke()
  }

  // border
  ctx.strokeStyle = 'rgba(250,245,235,0.30)'
  ctx.lineWidth = 16
  ctx.strokeRect(24, 24, w - 48, h - 48)
  ctx.strokeStyle = 'rgba(250,245,235,0.16)'
  ctx.lineWidth = 6
  ctx.strokeRect(48, 48, w - 96, h - 96)

  // fibre noise
  for (let i = 0; i < 9000; i += 1) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2)
  }
  return finish(canvas, { repeat: [1, 1] })
}

/** Vertical wood slat accent wall (behind the TV). */
export function createSlatTexture({ w = 512, h = 512, repeat = [4, 1] } = {}) {
  const { canvas, ctx } = makeCanvas(w, h)
  ctx.fillStyle = '#2a2320'
  ctx.fillRect(0, 0, w, h)
  const slats = 26
  const sw = w / slats
  for (let i = 0; i < slats; i += 1) {
    const x = i * sw
    const grad = ctx.createLinearGradient(x, 0, x + sw, 0)
    grad.addColorStop(0, '#6b4a34')
    grad.addColorStop(0.5, '#8a6446')
    grad.addColorStop(1, '#583c2a')
    ctx.fillStyle = grad
    ctx.fillRect(x + 1, 0, sw - 4, h)
  }
  return finish(canvas, { repeat })
}

/** A simple framed artwork. */
export function createArtTexture(variant = 0) {
  const { canvas, ctx } = makeCanvas(256, 340)
  const palettes = [
    ['#f2b56b', '#d96f4b', '#3c4b62'],
    ['#7fb2a6', '#2f4858', '#f3e2c7'],
    ['#cfd6e4', '#5b6b8c', '#f0a37d'],
  ]
  const palette = palettes[variant % palettes.length]
  const g = ctx.createLinearGradient(0, 0, 256, 340)
  g.addColorStop(0, palette[0])
  g.addColorStop(1, palette[1])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 340)
  ctx.globalAlpha = 0.9
  ctx.fillStyle = palette[2]
  ctx.beginPath()
  ctx.arc(128, 150, 74, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 0.5
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(0, 340)
  ctx.lineTo(120, 190)
  ctx.lineTo(256, 340)
  ctx.closePath()
  ctx.fill()
  ctx.globalAlpha = 1
  return finish(canvas)
}

/** Bright daytime sky dome. */
export function createSkyTexture({ w = 1024, h = 512 } = {}) {
  const { canvas, ctx } = makeCanvas(w, h)
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0.0, '#5b93d6')
  g.addColorStop(0.42, '#9ec6ea')
  g.addColorStop(0.55, '#dbe9f4')
  g.addColorStop(0.72, '#cbd8d3')
  g.addColorStop(1.0, '#8d9c96')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // soft sun glow on the window side (left wall => u ~ 0.75)
  const sun = ctx.createRadialGradient(w * 0.75, h * 0.28, 8, w * 0.75, h * 0.28, h * 0.42)
  sun.addColorStop(0, 'rgba(255,248,225,0.95)')
  sun.addColorStop(0.35, 'rgba(255,240,205,0.35)')
  sun.addColorStop(1, 'rgba(255,240,205,0)')
  ctx.fillStyle = sun
  ctx.fillRect(0, 0, w, h)

  // clouds
  for (let i = 0; i < 90; i += 1) {
    const cx = Math.random() * w
    const cy = h * (0.12 + Math.random() * 0.36)
    const r = 18 + Math.random() * 60
    const cloud = ctx.createRadialGradient(cx, cy, 2, cx, cy, r)
    cloud.addColorStop(0, 'rgba(255,255,255,0.55)')
    cloud.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = cloud
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  return finish(canvas, { repeat: [1, 1], srgb: true, anisotropy: 2 })
}

/** City silhouette used outside the window. */
export function createHorizonTexture({ w = 1024, h = 256 } = {}) {
  const { canvas, ctx } = makeCanvas(w, h)
  ctx.clearRect(0, 0, w, h)
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#7f9aa8')
  g.addColorStop(1, '#5d737d')
  ctx.fillStyle = g
  for (let x = 0; x < w; x += 26) {
    const bh = 40 + Math.random() * 130
    ctx.globalAlpha = 0.55 + Math.random() * 0.3
    ctx.fillRect(x, h - bh, 22, bh)
    // windows
    ctx.globalAlpha = 0.25
    ctx.fillStyle = '#ffeec2'
    for (let wy = h - bh + 8; wy < h - 8; wy += 16) {
      for (let wx = x + 4; wx < x + 18; wx += 8) {
        if (Math.random() > 0.55) ctx.fillRect(wx, wy, 3, 4)
      }
    }
    ctx.fillStyle = g
  }
  ctx.globalAlpha = 1
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.repeat.set(4, 1)
  return texture
}
