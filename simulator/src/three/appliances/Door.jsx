import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Clickable } from '../helpers/Clickable'
import { useDevice } from '../../store/useRoomStore'

/**
 * Interactive door.
 *
 * The group is aligned with the wall it sits in (`rotation`), the hinge is the
 * group origin and the panel extends along local -X. Swinging is therefore a
 * plain Y rotation on an inner group, animated towards the device state.
 */
export function Door({
  id,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  wall = 'front',
  width = 0.95,
  height = 2.1,
  openAngle = -1.72,
  panelColor = '#7d5a3c',
  trimColor = '#f3efe8',
  frameDepth = 0.04,
  handleSide = 'right',
}) {
  const device = useDevice(id)
  const swingRef = useRef()
  const knobRef = useRef()

  useFrame((_, delta) => {
    if (!swingRef.current) return
    const target = device?.open ? openAngle : 0
    const k = Math.min(1, delta * 3.4)
    swingRef.current.rotation.y += (target - swingRef.current.rotation.y) * k
    if (knobRef.current) knobRef.current.rotation.y += 0.02
  })

  if (!device) return null

  const half = width / 2
  const panelCenterX = -half
  const knobX = handleSide === 'right' ? -width + 0.09 : -0.09

  return (
    <group position={position} rotation={rotation}>
      {/* casing */}
      <mesh position={[0.025, height / 2, frameDepth]} castShadow>
        <boxGeometry args={[0.09, height + 0.12, 0.14]} />
        <meshStandardMaterial color={trimColor} roughness={0.6} />
      </mesh>
      <mesh position={[-width - 0.025, height / 2, frameDepth]} castShadow>
        <boxGeometry args={[0.09, height + 0.12, 0.14]} />
        <meshStandardMaterial color={trimColor} roughness={0.6} />
      </mesh>
      <mesh position={[-half, height + 0.045, frameDepth]} castShadow>
        <boxGeometry args={[width + 0.2, 0.1, 0.14]} />
        <meshStandardMaterial color={trimColor} roughness={0.6} />
      </mesh>
      {/* threshold */}
      <mesh position={[-half, 0.012, frameDepth]} receiveShadow>
        <boxGeometry args={[width + 0.16, 0.025, 0.2]} />
        <meshStandardMaterial color="#8a7f70" roughness={0.8} />
      </mesh>

      <Clickable id={id} labelOffset={[-half, height + 0.35, 0.2]} position={[0, 0, 0]}>
        <group ref={swingRef}>
          {/* panel */}
          <mesh position={[panelCenterX, height / 2, 0.02]} castShadow receiveShadow>
            <boxGeometry args={[width - 0.02, height - 0.02, 0.045]} />
            <meshStandardMaterial color={panelColor} roughness={0.62} metalness={0.04} />
          </mesh>

          {/* raised panels (both faces) */}
          {[0.72, 1.45].map((cy) =>
            [0.042, -0.002].map((cz, idx) => (
              <mesh key={`p-${cy}-${idx}`} position={[panelCenterX, cy, cz]}>
                <boxGeometry args={[width - 0.28, idx === 0 ? 0.55 : 0.55, 0.012]} />
                <meshStandardMaterial color={idx === 0 ? panelColor : panelColor} roughness={0.7} />
              </mesh>
            )),
          )}

          {/* handle */}
          <group position={[knobX, 1.03, 0.05]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.016, 0.016, 0.05, 12]} />
              <meshStandardMaterial color="#cbb277" roughness={0.28} metalness={0.9} />
            </mesh>
            <mesh ref={knobRef} position={[0, 0, 0.05]}>
              <boxGeometry args={[0.022, 0.14, 0.022]} />
              <meshStandardMaterial color="#cbb277" roughness={0.25} metalness={0.92} />
            </mesh>
          </group>
          <group position={[knobX, 1.03, -0.01]}>
            <mesh position={[0, 0, 0.05]}>
              <boxGeometry args={[0.022, 0.14, 0.022]} />
              <meshStandardMaterial color="#cbb277" roughness={0.25} metalness={0.92} />
            </mesh>
          </group>
        </group>
      </Clickable>

      {/* light spill from beyond the door when open */}
      {device.open && (
        <mesh position={[panelCenterX, 1.2, wall === 'right' ? -0.35 : 0.35]}>
          <planeGeometry args={[0.9, 2.0]} />
          <meshBasicMaterial color="#ffd9a0" transparent opacity={0.055} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}
