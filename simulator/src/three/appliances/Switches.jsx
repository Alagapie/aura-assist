import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { Clickable } from '../helpers/Clickable'
import { useCanvasTexture } from '../helpers/useCanvasTexture'
import { useRoomStore } from '../../store/useRoomStore'

/**
 * Two-gang wall switch plate. Each rocker is an independent clickable device
 * wired to a group of lights (see `switchA` / `switchB` in the store).
 */
export function SwitchPlate({ position = [-3.93, 1.25, 1.6], rotation = [0, Math.PI / 2, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[0.2, 0.3, 0.024]} radius={0.01} smoothness={3} castShadow>
        <meshStandardMaterial color="#f6f4f0" roughness={0.5} metalness={0.05} />
      </RoundedBox>
      <SwitchRocker id="switchA" x={-0.048} />
      <SwitchRocker id="switchB" x={0.048} />
    </group>
  )
}

function SwitchRocker({ id, x }) {
  const device = useRoomStore((s) => s.devices[id])
  const devices = useRoomStore((s) => s.devices)
  const ledRef = useRef()
  const rockerRef = useRef()

  const on = useMemo(
    () => (device?.controls || []).some((lightId) => devices[lightId]?.power),
    [device?.controls, devices],
  )

  useFrame((_, delta) => {
    const k = Math.min(1, delta * 8)
    if (rockerRef.current) {
      const target = on ? -0.13 : 0.13
      rockerRef.current.rotation.x += (target - rockerRef.current.rotation.x) * k
    }
    if (ledRef.current) {
      ledRef.current.emissiveIntensity += ((on ? 1.6 : 0.05) - ledRef.current.emissiveIntensity) * k
    }
  })

  if (!device) return null

  return (
    <Clickable id={id} position={[x, 0.03, 0.014]} labelOffset={[0, 0.28, 0.1]} childrenHighlight={false}>
      <RoundedBox args={[0.072, 0.14, 0.014]} radius={0.005} smoothness={3} ref={rockerRef}>
        <meshStandardMaterial color="#ffffff" roughness={0.42} metalness={0.04} />
      </RoundedBox>
      <mesh position={[0, -0.095, 0.006]}>
        <circleGeometry args={[0.0075, 12]} />
        <meshStandardMaterial ref={ledRef} color="#2b3a33" emissive="#7dffbf" emissiveIntensity={0.05} toneMapped={false} />
      </mesh>
    </Clickable>
  )
}

/**
 * Wall mounted smart control panel (the room "hub"). Its screen mirrors the
 * live room state; clicking it opens the scene controls in the UI.
 *
 * `id` selects which hub device drives the panel (so every room can mount one),
 * `label` is printed on the screen and `rotation` lets it sit on any wall.
 */
export function SmartPanel({
  id = 'hub',
  label = 'LIVING ROOM',
  position = [3.2, 1.42, -2.93],
  rotation = [0, 0, 0],
}) {
  const room = useRoomStore((s) => s.room)
  const devices = useRoomStore((s) => s.devices)
  const activeMode = useRoomStore((s) => s.activeMode)
  const ringRef = useRef()

  const lightsOn = Object.values(devices).filter((d) => d.type === 'light' && d.power).length
  const activeDevices = Object.values(devices).filter((d) =>
    d.power === true || d.open === true).length

  const draw = useMemo(
    () => (ctx, t) => {
      const w = ctx.canvas.width
      const h = ctx.canvas.height
      const bg = ctx.createLinearGradient(0, 0, 0, h)
      bg.addColorStop(0, '#0b1a22')
      bg.addColorStop(1, '#050a0e')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      ctx.strokeStyle = 'rgba(120,230,255,0.35)'
      ctx.lineWidth = 3
      ctx.strokeRect(6, 6, w - 12, h - 12)

      ctx.fillStyle = '#7de6ff'
      ctx.font = 'bold 15px system-ui, sans-serif'
      const clock = new Date()
      const hh = String(clock.getHours()).padStart(2, '0')
      const mm = String(clock.getMinutes()).padStart(2, '0')
      const ss = String(clock.getSeconds()).padStart(2, '0')
      ctx.fillText(`${hh}:${mm}:${ss}`, 16, 30)

      ctx.fillStyle = '#eaf6ff'
      ctx.font = 'bold 52px system-ui, sans-serif'
      ctx.fillText(`${room.temp.toFixed(1)}°`, 16, 92)
      ctx.fillStyle = 'rgba(200,235,255,0.7)'
      ctx.font = '15px system-ui, sans-serif'
      ctx.fillText(label, 16, 112)

      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.fillRect(16, 124, w - 32, 2)

      const rows = [
        ['MODE', activeMode],
        ['HUMIDITY', `${room.humidity.toFixed(0)}%`],
        ['LIGHTS ON', `${lightsOn}`],
        ['DEVICES', `${activeDevices}`],
        ['AC', devices.ac.power ? `${devices.ac.targetTemp}° COOL` : 'OFF'],
        ['TV', devices.tv.power ? `CH ${devices.tv.channel}` : 'STANDBY'],
      ]
      rows.forEach(([rowLabel, value], i) => {
        const y = 154 + i * 30
        ctx.fillStyle = 'rgba(180,220,240,0.55)'
        ctx.font = '13px system-ui, sans-serif'
        ctx.fillText(rowLabel, 16, y)
        ctx.fillStyle = '#cdeffc'
        ctx.font = 'bold 15px system-ui, sans-serif'
        ctx.fillText(String(value), w - 16 - ctx.measureText(String(value)).width, y)
      })

      // pulsing accent at the bottom
      ctx.fillStyle = `rgba(125,230,255,${0.35 + Math.sin(t * 2) * 0.25})`
      ctx.fillRect(16, h - 22, w - 32, 4)
    },
    [room.temp, room.humidity, activeMode, lightsOn, activeDevices, devices.ac.power, devices.ac.targetTemp, devices.tv.power, devices.tv.channel, label],
  )

  const texture = useCanvasTexture(256, 384, draw, [
    room.temp, room.humidity, activeMode, lightsOn, activeDevices,
    devices.ac.power, devices.ac.targetTemp, devices.tv.power, devices.tv.channel, label,
  ], 1)

  useFrame((state) => {
    if (!ringRef.current) return
    ringRef.current.emissiveIntensity = 0.6 + Math.sin(state.clock.elapsedTime * 1.6) * 0.25
  })

  return (
    <Clickable id={id} position={position} rotation={rotation} labelOffset={[0, 0.62, 0.15]} childrenHighlight={false}>
      <RoundedBox args={[0.36, 0.52, 0.026]} radius={0.01} smoothness={3} castShadow>
        <meshStandardMaterial color="#15191d" roughness={0.35} metalness={0.6} />
      </RoundedBox>
      <mesh position={[0, 0.02, 0.016]}>
        <planeGeometry args={[0.3, 0.44]} />
        <meshStandardMaterial
          map={texture}
          emissiveMap={texture}
          emissive="#ffffff"
          emissiveIntensity={1.05}
          color="#0a0d10"
          roughness={0.25}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={ringRef} position={[0, -0.235, 0.016]}>
        <boxGeometry args={[0.3, 0.012, 0.008]} />
        <meshStandardMaterial
          color="#0b2530"
          emissive="#7de6ff"
          emissiveIntensity={0.7}
          toneMapped={false}
        />
      </mesh>
      {/* screen glow on the wall */}
      <mesh position={[0, 0.02, 0.06]}>
        <planeGeometry args={[1.1, 1.1]} />
        <meshBasicMaterial
          color="#7de6ff"
          transparent
          opacity={0.05}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </Clickable>
  )
}
