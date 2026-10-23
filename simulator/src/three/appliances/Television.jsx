import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { Clickable } from '../helpers/Clickable'
import { useCanvasTexture } from '../helpers/useCanvasTexture'
import { createGlowTexture } from '../helpers/glow'
import { useDevice } from '../../store/useRoomStore'

const glowTexture = typeof window !== 'undefined' ? createGlowTexture() : null

export const CHANNELS = [
  { n: 1, name: 'Aurora News', accent: '#3f6fb5', tint: '#7fb0ff' },
  { n: 2, name: 'Nature 4K', accent: '#2f7d5b', tint: '#79d9a8' },
  { n: 3, name: 'Cinema One', accent: '#8a4b2a', tint: '#ffb066' },
  { n: 4, name: 'City Sports', accent: '#2c7a3f', tint: '#a8e06a' },
]

export const getChannel = (n) => CHANNELS.find((c) => c.n === n) || CHANNELS[0]

/* ------------------------------- screen art ------------------------------- */

function drawNews(ctx, t, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, '#12305c')
  g.addColorStop(0.6, '#1b4a86')
  g.addColorStop(1, '#0d2246')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // studio backdrop bars
  ctx.globalAlpha = 0.18
  for (let i = 0; i < 6; i += 1) {
    ctx.fillStyle = '#8fc4ff'
    const x = ((i * 90 + t * 14) % (w + 120)) - 60
    ctx.fillRect(x, 0, 26, h)
  }
  ctx.globalAlpha = 1

  // globe
  const cx = w * 0.72
  const cy = h * 0.42
  const r = 52
  const globe = ctx.createRadialGradient(cx - 18, cy - 18, 6, cx, cy, r)
  globe.addColorStop(0, '#dff0ff')
  globe.addColorStop(1, '#2b6bb5')
  ctx.fillStyle = globe
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 1.5
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * (0.3 + i * 0.28), 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.ellipse(cx, cy, r * 0.985, r, t * 0.6 % (Math.PI * 2), 0, Math.PI * 2)
  ctx.stroke()

  // logo + headline
  ctx.fillStyle = '#ffd76a'
  ctx.font = 'bold 26px system-ui, sans-serif'
  ctx.fillText('AURORA NEWS', 24, 46)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 20px system-ui, sans-serif'
  ctx.fillText('Markets rally as smart homes', 24, h - 92)
  ctx.fillText('enter their busiest quarter', 24, h - 66)

  // ticker
  ctx.fillStyle = 'rgba(10,20,40,0.85)'
  ctx.fillRect(0, h - 42, w, 42)
  ctx.fillStyle = '#ffd76a'
  ctx.fillRect(0, h - 44, 96, 44)
  ctx.fillStyle = '#102040'
  ctx.font = 'bold 17px system-ui, sans-serif'
  ctx.fillText('LIVE', 26, h - 14)
  ctx.fillStyle = '#e8eef8'
  ctx.font = '17px system-ui, sans-serif'
  const ticker = 'SIMULATED BROADCAST · 21 C INDOORS · LIGHTS 85% · AC COOLING TO 22 C · '
  const offset = (t * 60) % 400
  ctx.fillText(ticker + ticker, 108 - offset, h - 14)
}

function drawNature(ctx, t, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#8fd3f4')
  sky.addColorStop(0.55, '#cdeef7')
  sky.addColorStop(1, '#f3f0d8')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  // sun
  ctx.fillStyle = 'rgba(255,244,190,0.95)'
  ctx.beginPath()
  ctx.arc(w * 0.22, h * 0.24, 30, 0, Math.PI * 2)
  ctx.fill()

  // hills
  const hills = [['#4f9e6a', 0.62], ['#3a7d52', 0.72], ['#2c6242', 0.82]]
  hills.forEach(([color, base], i) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let x = 0; x <= w; x += 8) {
      const y = h * base + Math.sin(x * 0.012 + i * 2 + t * 0.2) * (16 - i * 4)
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fill()
  })

  // lake shimmer
  ctx.fillStyle = 'rgba(160,215,235,0.7)'
  ctx.fillRect(w * 0.42, h * 0.78, w * 0.34, h * 0.1)
  ctx.strokeStyle = 'rgba(255,255,255,0.65)'
  ctx.lineWidth = 2
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath()
    const y = h * 0.8 + i * 9
    ctx.moveTo(w * 0.44, y)
    ctx.lineTo(w * 0.44 + 60 + Math.sin(t * 2 + i) * 22, y)
    ctx.stroke()
  }

  // birds
  ctx.strokeStyle = 'rgba(40,60,50,0.75)'
  ctx.lineWidth = 2
  for (let i = 0; i < 4; i += 1) {
    const bx = (t * 22 + i * 90) % (w + 80) - 40
    const by = 70 + Math.sin(t + i) * 12 + i * 12
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.quadraticCurveTo(bx + 10, by - 8, bx + 20, by)
    ctx.quadraticCurveTo(bx + 30, by - 8, bx + 40, by)
    ctx.stroke()
  }

  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = 'bold 24px system-ui, sans-serif'
  ctx.fillText('NATURE 4K', 24, 46)
  ctx.font = '16px system-ui, sans-serif'
  ctx.fillText('Wild Colours · Episode 3', 24, 70)
}

function drawCinema(ctx, t, w, h) {
  ctx.fillStyle = '#07070b'
  ctx.fillRect(0, 0, w, h)

  // moving spotlight
  const sx = w * 0.5 + Math.sin(t * 0.6) * w * 0.22
  const glow = ctx.createRadialGradient(sx, h * 0.55, 10, sx, h * 0.55, 210)
  glow.addColorStop(0, 'rgba(255,196,120,0.75)')
  glow.addColorStop(0.4, 'rgba(255,150,80,0.22)')
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)

  // silhouettes
  ctx.fillStyle = 'rgba(10,10,14,0.92)'
  for (let i = 0; i < 9; i += 1) {
    const x = 20 + i * 56
    const bob = Math.sin(t * 2 + i) * 3
    ctx.beginPath()
    ctx.arc(x, h * 0.66 + bob, 15, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(x - 20, h * 0.66 + bob + 12, 40, h * 0.4)
  }

  // film grain
  for (let i = 0; i < 220; i += 1) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2)
  }

  ctx.fillStyle = 'rgba(255,220,170,0.95)'
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.fillText('CINEMA ONE', 24, 44)
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.font = '15px system-ui, sans-serif'
  ctx.fillText('Now playing · Neon Harbour', 24, 68)

  // letterbox
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, 14)
  ctx.fillRect(0, h - 14, w, 14)
}

function drawSports(ctx, t, w, h) {
  ctx.fillStyle = '#2c7a3f'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 8; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.045)'
    ctx.fillRect((i * w) / 8, 0, w / 8, h)
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(w * 0.5, h * 0.5, 62, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(w * 0.5, 0)
  ctx.lineTo(w * 0.5, h)
  ctx.stroke()

  // ball + players
  const bx = w * 0.5 + Math.sin(t * 1.1) * w * 0.3
  const by = h * 0.5 + Math.cos(t * 1.7) * h * 0.22
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(bx, by, 7, 0, Math.PI * 2)
  ctx.fill()
  for (let i = 0; i < 5; i += 1) {
    const px = w * 0.18 + i * 46 + Math.sin(t * 1.3 + i) * 10
    const py = h * 0.66 + Math.cos(t * 1.9 + i) * 8
    ctx.fillStyle = i % 2 === 0 ? '#e8e8f2' : '#20242e'
    ctx.beginPath()
    ctx.arc(px, py, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(px - 5, py + 6, 10, 16)
  }

  // scoreboard
  ctx.fillStyle = 'rgba(8,12,16,0.82)'
  ctx.fillRect(w - 210, 14, 190, 46)
  ctx.fillStyle = '#a8e06a'
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.fillText(`CITY  2 - 1  UNITED`, w - 200, 46)
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.font = '14px system-ui, sans-serif'
  ctx.fillText(`${58 + Math.floor(t % 60)}'   SECOND HALF`, w - 196, 74)
}

const RENDERERS = { 1: drawNews, 2: drawNature, 3: drawCinema, 4: drawSports }

/* ------------------------------ screen logic ------------------------------ */

function drawScreen(ctx, t, device, overlay) {
  const w = ctx.canvas.width
  const h = ctx.canvas.height

  if (!device.power) {
    ctx.fillStyle = '#05070a'
    ctx.fillRect(0, 0, w, h)
    // faint standby LED glow
    const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.5)
    g.addColorStop(0, 'rgba(30,40,55,0.55)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    return
  }

  const channel = getChannel(device.channel)
  const render = RENDERERS[device.channel] || drawNews
  render(ctx, t, w, h)

  if (device.muted) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(w - 74, h - 54, 58, 40)
    ctx.fillStyle = '#ff8f8f'
    ctx.font = 'bold 18px system-ui, sans-serif'
    ctx.fillText('MUTE', w - 68, h - 26)
  }

  // contextual overlay (volume / channel) shown for a couple of seconds
  if (overlay && overlay.until > t) {
    const fade = Math.min(1, (overlay.until - t) * 1.6)
    ctx.globalAlpha = fade
    if (overlay.type === 'volume') {
      const barW = 200
      const x = w / 2 - barW / 2
      const y = h - 74
      ctx.fillStyle = 'rgba(6,10,18,0.72)'
      ctx.fillRect(x - 26, y - 26, barW + 52, 56)
      ctx.fillStyle = '#dbe7f5'
      ctx.font = 'bold 15px system-ui, sans-serif'
      ctx.fillText(`VOLUME ${device.muted ? 0 : device.volume}%`, x, y - 6)
      ctx.fillStyle = 'rgba(255,255,255,0.22)'
      ctx.fillRect(x, y + 2, barW, 8)
      ctx.fillStyle = channel.tint
      ctx.fillRect(x, y + 2, (barW * (device.muted ? 0 : device.volume)) / 100, 8)
    } else if (overlay.type === 'channel') {
      ctx.fillStyle = 'rgba(6,10,18,0.72)'
      ctx.fillRect(24, h / 2 - 34, 250, 68)
      ctx.fillStyle = channel.tint
      ctx.font = 'bold 30px system-ui, sans-serif'
      ctx.fillText(`CH ${String(device.channel).padStart(2, '0')}`, 40, h / 2 + 4)
      ctx.fillStyle = '#e6eefb'
      ctx.font = '17px system-ui, sans-serif'
      ctx.fillText(channel.name.toUpperCase(), 40, h / 2 + 26)
    }
    ctx.globalAlpha = 1
  }
}

/* -------------------------------- component ------------------------------- */

/**
 * Wall mounted television. Clicking the panel toggles power; channel, volume
 * and mute are handled from the contextual device panel.
 */
export function Television({ id = 'tv', position = [0, 1.7, -2.95] }) {
  const device = useDevice(id)
  const overlayRef = useRef(null)
  const prevRef = useRef({ volume: device?.volume, channel: device?.channel, muted: device?.muted })
  const lightRef = useRef()
  const glowRef = useRef()

  // detect volume/channel changes to flash the on-screen overlay
  useEffect(() => {
    if (!device) return
    const prev = prevRef.current
    const now = performance.now() / 1000
    if (prev.volume !== device.volume || prev.muted !== device.muted) {
      overlayRef.current = { type: 'volume', until: now + 2.2 }
    } else if (prev.channel !== device.channel) {
      overlayRef.current = { type: 'channel', until: now + 2.6 }
    }
    prevRef.current = { volume: device.volume, channel: device.channel, muted: device.muted }
  }, [device?.volume, device?.channel, device?.muted])

  const draw = useMemo(
    () => (ctx, t) => drawScreen(ctx, t, device, overlayRef.current),
    [device?.power, device?.channel, device?.volume, device?.muted],
  )
  const texture = useCanvasTexture(512, 288, draw, [device?.power, device?.channel, device?.volume, device?.muted], device?.power ? 12 : 0)

  const channel = getChannel(device?.channel ?? 1)
  const glowColor = useMemo(() => new THREE.Color(channel.tint), [channel.tint])

  useFrame((_, delta) => {
    const k = Math.min(1, delta * 5)
    const light = lightRef.current
    if (light) {
      const target = device?.power ? 1.5 : 0
      light.intensity += (target - light.intensity) * k
      light.color.lerp(glowColor, k)
    }
    const glow = glowRef.current
    if (glow) {
      const target = device?.power ? 0.16 : 0
      glow.opacity += (target - glow.opacity) * k
      glow.color.lerp(glowColor, k)
    }
  })

  if (!device) return null

  return (
    <Clickable id={id} position={position} labelOffset={[0, 0.62, 0.25]} childrenHighlight={false}>
      {/* wall bracket */}
      <mesh position={[0, 0, -0.045]}>
        <boxGeometry args={[0.3, 0.3, 0.05]} />
        <meshStandardMaterial color="#2a2c30" roughness={0.6} metalness={0.4} />
      </mesh>

      {/* bezel */}
      <RoundedBox args={[1.52, 0.9, 0.05]} radius={0.018} smoothness={4} position={[0, 0, 0.02]} castShadow>
        <meshStandardMaterial color="#17191c" roughness={0.35} metalness={0.55} />
      </RoundedBox>

      {/* screen */}
      <mesh position={[0, 0, 0.047]}>
        <planeGeometry args={[1.42, 0.81]} />
        <meshStandardMaterial
          map={texture}
          emissiveMap={texture}
          emissive="#ffffff"
          emissiveIntensity={device.power ? 1.05 : 0}
          color={device.power ? '#ffffff' : '#05070a'}
          roughness={0.22}
          metalness={0.15}
          toneMapped={false}
        />
      </mesh>

      {/* stand-base logo strip */}
      <mesh position={[0, -0.47, 0.02]}>
        <boxGeometry args={[0.2, 0.02, 0.03]} />
        <meshStandardMaterial color="#2b2e33" roughness={0.4} metalness={0.6} />
      </mesh>

      {/* screen light spill into the room */}
      <mesh position={[0, 0, 0.6]}>
        <planeGeometry args={[3.2, 2.1]} />
        <meshBasicMaterial
          ref={glowRef}
          map={glowTexture}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          color={channel.tint}
        />
      </mesh>
      <pointLight ref={lightRef} position={[0, -0.1, 0.7]} distance={3.6} decay={2} intensity={0} color={channel.tint} />
    </Clickable>
  )
}
