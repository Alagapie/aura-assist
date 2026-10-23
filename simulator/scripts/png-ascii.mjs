/**
 * Tiny PNG -> ASCII inspector.
 *
 * Used during development to verify that the WebGL scene actually renders
 * (framing, lighting, silhouettes) without needing an image viewer.
 *
 * Usage: node scripts/png-ascii.mjs <file.png> [cols] [rows] [x0] [y0] [x1] [y1]
 * The optional x0 y0 x1 y1 crop is given as fractions of the image (0..1).
 */
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const [, , file, colsArg = '76', rowsArg = '30', ...cropArgs] = process.argv

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let offset = 8
  let ihdr = null
  const idat = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      }
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }
  if (!ihdr) throw new Error('missing IHDR')
  if (ihdr.bitDepth !== 8 || ihdr.interlace !== 0) {
    throw new Error(`unsupported PNG (depth ${ihdr.bitDepth}, interlace ${ihdr.interlace})`)
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.colorType]
  if (!channels) throw new Error(`unsupported color type ${ihdr.colorType}`)

  const raw = inflateSync(Buffer.concat(idat))
  const stride = ihdr.width * channels
  const out = Buffer.alloc(stride * ihdr.height)
  let pos = 0
  for (let y = 0; y < ihdr.height; y++) {
    const filter = raw[pos++]
    const line = raw.subarray(pos, pos + stride)
    pos += stride
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= channels ? prev[x - channels] : 0
      const v = line[x]
      let value
      switch (filter) {
        case 0: value = v; break
        case 1: value = v + a; break
        case 2: value = v + b; break
        case 3: value = v + ((a + b) >> 1); break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          value = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
          break
        }
        default: throw new Error(`bad filter ${filter}`)
      }
      cur[x] = value & 0xff
    }
  }
  return { ...ihdr, channels, pixels: out, stride }
}

const img = decodePng(readFileSync(file))
const cols = Number(colsArg)
const rows = Number(rowsArg)
const crop = cropArgs.length === 4 ? cropArgs.map(Number) : [0, 0, 1, 1]
const x0 = Math.round(crop[0] * img.width)
const y0 = Math.round(crop[1] * img.height)
const x1 = Math.round(crop[2] * img.width)
const y1 = Math.round(crop[3] * img.height)
const cw = (x1 - x0) / cols
const ch = (y1 - y0) / rows

const ramp = ' .:-=+*#%@'
const hist = new Map()
let sum = 0
let min = 255
let max = 0
const lines = []

for (let ry = 0; ry < rows; ry++) {
  let line = ''
  for (let rx = 0; rx < cols; rx++) {
    let rs = 0
    let gs = 0
    let bs = 0
    let n = 0
    for (let y = Math.floor(y0 + ry * ch); y < Math.floor(y0 + (ry + 1) * ch); y++) {
      for (let x = Math.floor(x0 + rx * cw); x < Math.floor(x0 + (rx + 1) * cw); x++) {
        const i = y * img.stride + x * img.channels
        rs += img.pixels[i]
        gs += img.pixels[i + 1] ?? img.pixels[i]
        bs += img.pixels[i + 2] ?? img.pixels[i]
        n++
      }
    }
    const r = rs / n
    const g = gs / n
    const b = bs / n
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sum += lum
    if (lum < min) min = lum
    if (lum > max) max = lum
    const key = `${Math.round(r / 32)},${Math.round(g / 32)},${Math.round(b / 32)}`
    hist.set(key, (hist.get(key) ?? 0) + 1)
    line += ramp[Math.min(9, Math.floor(lum / 25.6))]
  }
  lines.push(line)
}

const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
console.log(`image ${img.width}x${img.height} crop ${x0},${y0} -> ${x1},${y1}`)
console.log(`luminance mean ${(sum / (cols * rows)).toFixed(1)} min ${min.toFixed(0)} max ${max.toFixed(0)}`)
console.log(`top 32-bucket colors (r,g,b chunks 0-8): ${top.map(([k, v]) => `${k}:${v}`).join('  ')}`)
console.log(lines.join('\n'))
