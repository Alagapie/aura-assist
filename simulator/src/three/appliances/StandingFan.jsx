import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Clickable } from '../helpers/Clickable'
import { useDevice } from '../../store/useRoomStore'

const SPEED_TO_RAD = { 1: 3.2, 2: 6.5, 3: 10.5 }

/**
 * Pedestal fan. Clicking the housing toggles the appliance; the contextual
 * panel changes the speed and the oscillation. The blades spin and the head
 * sweeps whenever the fan runs.
 */
export function StandingFan({ id = 'fan', position = [3.0, 0, -1.4], rotation = [0, 0, 0] }) {
  const device = useDevice(id)
  const bladesRef = useRef()
  const headRef = useRef()
  const ledRef = useRef()

  useFrame((state, delta) => {
    if (!device) return
    const running = device.power
    const targetSpeed = running ? (SPEED_TO_RAD[device.speed] || 6) : 0
    if (bladesRef.current) {
      // spin up / coast down
      const current = bladesRef.current.userData.speed ?? 0
      const next = current + (targetSpeed - current) * Math.min(1, delta * 1.6)
      bladesRef.current.userData.speed = next
      bladesRef.current.rotation.z += next * delta
    }
    if (headRef.current) {
      const sweep = running && device.oscillate ? Math.sin(state.clock.elapsedTime * 0.7) * 0.55 : 0
      headRef.current.rotation.y += (sweep - headRef.current.rotation.y) * Math.min(1, delta * 2.2)
    }
    if (ledRef.current) {
      const target = running ? 1.6 : 0.04
      ledRef.current.emissiveIntensity += (target - ledRef.current.emissiveIntensity) * Math.min(1, delta * 5)
    }
  })

  if (!device) return null

  return (
    <Clickable id={id} position={position} rotation={rotation} labelOffset={[0, 1.95, 0.2]} childrenHighlight={false}>
      {/* base */}
      <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.23, 0.26, 0.04, 28]} />
        <meshStandardMaterial color="#2d3136" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.055, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.13, 0.06, 20]} />
        <meshStandardMaterial color="#3a3f45" roughness={0.4} metalness={0.5} />
      </mesh>

      {/* pole */}
      <mesh position={[0, 0.62, 0]} castShadow>
        <cylinderGeometry args={[0.026, 0.03, 1.14, 16]} />
        <meshStandardMaterial color="#8f979f" roughness={0.28} metalness={0.9} />
      </mesh>

      {/* control box */}
      <mesh position={[0, 0.95, 0.03]} castShadow>
        <boxGeometry args={[0.14, 0.1, 0.07]} />
        <meshStandardMaterial color="#e9ecef" roughness={0.5} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-0.04 + i * 0.04, 0.965, 0.066]}>
          <circleGeometry args={[0.010, 10]} />
          <meshStandardMaterial color="#b9c0c7" roughness={0.4} metalness={0.4} />
        </mesh>
      ))}
      <mesh position={[0.045, 0.925, 0.066]}>
        <circleGeometry args={[0.008, 10]} />
        <meshStandardMaterial
          ref={ledRef}
          color="#123"
          emissive={device.power ? '#7dffbf' : '#0b2a1c'}
          emissiveIntensity={0.04}
          toneMapped={false}
        />
      </mesh>

      {/* head assembly (oscillates) */}
      <group ref={headRef} position={[0, 1.32, 0]}>
        {/* motor housing */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.12]} castShadow>
          <cylinderGeometry args={[0.095, 0.095, 0.26, 22]} />
          <meshStandardMaterial color="#3d434a" roughness={0.35} metalness={0.55} />
        </mesh>

        {/* guard: hub, rings and spokes */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.02]}>
          <cylinderGeometry args={[0.055, 0.055, 0.07, 18]} />
          <meshStandardMaterial color="#585f66" roughness={0.35} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0, 0.06]}>
          <torusGeometry args={[0.33, 0.012, 8, 36]} />
          <meshStandardMaterial color="#aab1b8" roughness={0.3} metalness={0.85} />
        </mesh>
        <mesh position={[0, 0, 0.02]}>
          <torusGeometry args={[0.2, 0.009, 8, 30]} />
          <meshStandardMaterial color="#aab1b8" roughness={0.3} metalness={0.85} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[0, 0, 0.045]} rotation={[0, 0, (i * Math.PI) / 4]}>
            <boxGeometry args={[0.014, 0.66, 0.014]} />
            <meshStandardMaterial color="#b6bdc4" roughness={0.3} metalness={0.85} />
          </mesh>
        ))}

        {/* blades */}
        <group ref={bladesRef} position={[0, 0, 0.055]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.05, 16]} />
            <meshStandardMaterial color="#cfd4d9" roughness={0.5} />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <group key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
              <mesh position={[0.21, 0, 0]} rotation={[0.42, 0, 0]}>
                <boxGeometry args={[0.32, 0.012, 0.13]} />
                <meshStandardMaterial color="#eef1f4" roughness={0.55} metalness={0.05} transparent opacity={0.92} />
              </mesh>
            </group>
          ))}
        </group>

        {/* head tilt joint */}
        <mesh position={[0, -0.09, -0.06]}>
          <sphereGeometry args={[0.055, 16, 12]} />
          <meshStandardMaterial color="#6c737a" roughness={0.35} metalness={0.6} />
        </mesh>
      </group>
    </Clickable>
  )
}
