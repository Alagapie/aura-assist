import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { Clickable } from '../helpers/Clickable'
import { useCanvasTexture } from '../helpers/useCanvasTexture'
import { useDevice, useRoomStore } from '../../store/useRoomStore'

const AC_TINT = {
  cool: { text: '#6ff0ff', led: '#6ff0ff', wash: '#9fe8ff' },
  heat: { text: '#ffb46b', led: '#ffa24a', wash: '#ffd0a0' },
  dry: { text: '#a9e6ff', led: '#8fd6ff', wash: '#bfe6ff' },
  auto: { text: '#c9f5e6', led: '#8fe9cf', wash: '#bfead9' },
  fan: { text: '#c8f5b0', led: '#a6e88a', wash: '#cdeec0' },
}
const AC_LABEL = { cool: 'COOL', heat: 'HEAT', dry: 'DRY', auto: 'AUTO', fan: 'FAN' }

/**
 * Wall mounted split air conditioner. The display shows the live target and
 * room temperature, the louvers swing open when the unit runs and a subtle wash
 * is projected down from the vent — cool blue when cooling, warm amber when
 * heating, so the operating mode reads at a glance.
 */
export function AirConditioner({ id = 'ac', position = [3.92, 2.45, -1.5], rotation = [0, -Math.PI / 2, 0] }) {
  const device = useDevice(id)
  const roomTemp = useRoomStore((s) => s.room.temp)
  const louverRef = useRef()
  const lowerLouverRef = useRef()
  const ledRef = useRef()

  const tint = AC_TINT[device?.mode] || AC_TINT.cool
  const modeLabel = AC_LABEL[device?.mode] || 'COOL'

  const draw = useMemo(
    () => (ctx) => {
      const w = ctx.canvas.width
      const h = ctx.canvas.height
      ctx.fillStyle = device.power ? '#04080c' : '#04080c'
      ctx.fillRect(0, 0, w, h)

      if (device.power) {
        ctx.fillStyle = tint.text
        ctx.font = 'bold 44px system-ui, sans-serif'
        ctx.fillText(`${device.targetTemp}°`, 12, 52)
        ctx.font = 'bold 18px system-ui, sans-serif'
        ctx.fillStyle = tint.text
        ctx.fillText(modeLabel, 12, 78)
        ctx.fillStyle = 'rgba(200,225,240,0.7)'
        ctx.font = '16px system-ui, sans-serif'
        ctx.fillText(`ROOM ${roomTemp.toFixed(1)}°`, w - 128, 34)
        ctx.fillText('FAN  AUTO', w - 128, 60)
        ctx.fillStyle = tint.led
        ctx.fillRect(w - 24, 16, 10, 10)
      } else {
        ctx.fillStyle = 'rgba(120,140,150,0.55)'
        ctx.font = 'bold 24px system-ui, sans-serif'
        ctx.fillText('OFF', 16, 56)
      }
      // brushed panel line
      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      ctx.fillRect(0, h - 6, w, 6)
    },
    [device.power, device.targetTemp, roomTemp, tint, modeLabel],
  )
  const texture = useCanvasTexture(256, 96, draw, [device.power, device.targetTemp, roomTemp], device.power ? 1 : 0)

  useFrame((state, delta) => {
    const k = Math.min(1, delta * 4)
    const open = device.power ? 0.55 + Math.sin(state.clock.elapsedTime * 0.6) * 0.05 : 0.02
    if (louverRef.current) louverRef.current.rotation.x += (open - louverRef.current.rotation.x) * k
    if (lowerLouverRef.current) {
      lowerLouverRef.current.rotation.x += ((device.power ? 0.3 : 0.02) - lowerLouverRef.current.rotation.x) * k
    }
    if (ledRef.current) {
      const target = device.power ? 2.2 : 0.05
      ledRef.current.emissiveIntensity += (target - ledRef.current.emissiveIntensity) * k
    }
  })

  if (!device) return null

  return (
    <Clickable id={id} position={position} rotation={rotation} labelOffset={[0, 0.3, 0.2]} childrenHighlight={false}>
      {/* body */}
      <RoundedBox args={[0.9, 0.3, 0.22]} radius={0.035} smoothness={3} castShadow>
        <meshStandardMaterial color="#f4f5f7" roughness={0.45} metalness={0.08} />
      </RoundedBox>

      {/* intake grille on top */}
      <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.82, 0.2]} />
        <meshStandardMaterial color="#dfe2e6" roughness={0.8} />
      </mesh>

      {/* display */}
      <mesh position={[0, 0.005, 0.112]}>
        <planeGeometry args={[0.5, 0.15]} />
        <meshStandardMaterial
          map={texture}
          emissiveMap={texture}
          emissive="#ffffff"
          emissiveIntensity={device.power ? 1.1 : 0.35}
          color="#0a0c0e"
          roughness={0.3}
          toneMapped={false}
        />
      </mesh>

      {/* vent + louvers */}
      <mesh position={[0, -0.11, 0.075]} rotation={[-0.5, 0, 0]}>
        <boxGeometry args={[0.8, 0.018, 0.1]} />
        <meshStandardMaterial color="#c9ced4" roughness={0.6} />
      </mesh>
      <mesh ref={louverRef} position={[0, -0.135, 0.075]}>
        <boxGeometry args={[0.82, 0.012, 0.12]} />
        <meshStandardMaterial color="#eceef1" roughness={0.5} />
      </mesh>
      <mesh ref={lowerLouverRef} position={[0, -0.155, 0.05]}>
        <boxGeometry args={[0.82, 0.01, 0.1]} />
        <meshStandardMaterial color="#dfe3e7" roughness={0.55} />
      </mesh>

      {/* power LED */}
      <mesh position={[0.36, -0.1, 0.113]}>
        <circleGeometry args={[0.014, 12]} />
        <meshStandardMaterial ref={ledRef} color="#0a3a44" emissive={tint.led} emissiveIntensity={0.05} toneMapped={false} />
      </mesh>

      {/* conditioned-air wash (cool blue when cooling, warm amber when heating) */}
      <mesh position={[0, -0.75, 0.28]} rotation={[0, 0, 0]}>
        <coneGeometry args={[0.75, 1.5, 18, 1, true]} />
        <meshBasicMaterial
          color={tint.wash}
          transparent
          opacity={device.power ? 0.07 : 0}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </Clickable>
  )
}
