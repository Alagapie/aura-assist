import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { Clickable } from '../helpers/Clickable'
import { useDevice } from '../../store/useRoomStore'
import { sensorActive } from '../../config/devices'

const CERAMIC = { color: '#f4f6f7', roughness: 0.18, metalness: 0.02 }
const METAL = { color: '#a8b0b8', roughness: 0.28, metalness: 0.88 }

/** Close-coupled toilet: bowl, cistern, seat + flush button. */
export function Toilet({ position = [4.6, 0, -6.6], rotation = [0, Math.PI / 2, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      {/* cistern against the wall */}
      <RoundedBox args={[0.2, 0.5, 0.42]} radius={0.03} smoothness={3} position={[0, 0.78, -0.26]} castShadow receiveShadow>
        <meshStandardMaterial {...CERAMIC} />
      </RoundedBox>
      <mesh position={[0, 1.04, -0.26]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 0.02, 18]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      {/* bowl */}
      <mesh position={[0, 0.4, 0.06]} castShadow receiveShadow>
        <cylinderGeometry args={[0.19, 0.13, 0.4, 22]} />
        <meshStandardMaterial {...CERAMIC} />
      </mesh>
      <mesh position={[0, 0.6, 0.08]} scale={[1, 0.45, 1.25]} castShadow>
        <sphereGeometry args={[0.22, 22, 16]} />
        <meshStandardMaterial {...CERAMIC} />
      </mesh>
      {/* pedestal */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.14, 0.4, 18]} />
        <meshStandardMaterial {...CERAMIC} />
      </mesh>
      {/* seat + lid */}
      <mesh position={[0, 0.68, 0.08]} rotation={[-0.06, 0, 0]} castShadow>
        <torusGeometry args={[0.17, 0.028, 8, 26]} />
        <meshStandardMaterial color="#e9edee" roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.7, -0.1]} rotation={[Math.PI / 2 - 0.25, 0, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.02, 26]} />
        <meshStandardMaterial color="#eef1f2" roughness={0.3} />
      </mesh>
      {/* roll holder */}
      <mesh position={[0.3, 0.9, -0.1]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.012, 0.012, 0.16, 10]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position={[0.3, 0.9, -0.1]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.055, 0.055, 0.12, 16]} />
        <meshStandardMaterial color="#fbfbfa" roughness={0.95} />
      </mesh>
    </group>
  )
}

/**
 * Vanity unit with an inset basin, mixer tap and a big mirror. The mirror light
 * (`mirrorLight`) is a separate device rendered above the glass; the mirror
 * itself dims its reflection tint slightly when the room light is off.
 */
export function Vanity({ position = [6.4, 0, -8.55], rotation = [0, 0, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      {/* cabinet */}
      <RoundedBox args={[1.1, 0.78, 0.5]} radius={0.02} smoothness={3} position={[0, 0.42, 0.25]} castShadow receiveShadow>
        <meshStandardMaterial color="#4f5f66" roughness={0.6} />
      </RoundedBox>
      {/* drawer fronts */}
      {[0.28, 0.58].map((y) => (
        <group key={y}>
          <mesh position={[0, y, 0.505]}>
            <boxGeometry args={[1.04, 0.26, 0.012]} />
            <meshStandardMaterial color="#46565d" roughness={0.55} />
          </mesh>
          <mesh position={[0, y, 0.518]}>
            <boxGeometry args={[0.5, 0.02, 0.02]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
        </group>
      ))}
      {/* worktop + basin */}
      <mesh position={[0, 0.83, 0.26]} castShadow receiveShadow>
        <boxGeometry args={[1.16, 0.06, 0.56]} />
        <meshStandardMaterial color="#e6e8e6" roughness={0.3} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.85, 0.28]}>
        <boxGeometry args={[0.5, 0.1, 0.38]} />
        <meshStandardMaterial color="#d7dcde" roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.87, 0.28]}>
        <boxGeometry args={[0.44, 0.09, 0.32]} />
        <meshStandardMaterial color="#b9c2c6" roughness={0.2} metalness={0.1} />
      </mesh>
      {/* tap */}
      <mesh position={[0, 0.95, 0.09]} castShadow>
        <cylinderGeometry args={[0.018, 0.022, 0.2, 12]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position={[0, 1.05, 0.17]} rotation={[Math.PI / 2.6, 0, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.2, 12]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      {/* mirror (frameless, edge-lit) */}
      <mesh position={[0, 1.75, 0.01]}>
        <boxGeometry args={[0.95, 1.0, 0.025]} />
        <meshStandardMaterial color="#cfd8dd" roughness={0.08} metalness={0.9} />
      </mesh>
      <mesh position={[0, 1.75, 0.026]}>
        <planeGeometry args={[0.88, 0.93]} />
        <meshStandardMaterial color="#9fb4c0" roughness={0.05} metalness={0.75} />
      </mesh>
      {/* soap + tumbler */}
      <mesh position={[0.38, 0.9, 0.38]} castShadow>
        <boxGeometry args={[0.08, 0.12, 0.06]} />
        <meshStandardMaterial color="#d8c9b2" roughness={0.5} />
      </mesh>
      <mesh position={[-0.36, 0.9, 0.4]} castShadow>
        <cylinderGeometry args={[0.04, 0.035, 0.1, 16]} />
        <meshStandardMaterial color="#7d95a8" roughness={0.4} />
      </mesh>
      {/* towel ring */}
      <mesh position={[0.72, 1.3, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.07, 0.01, 8, 20]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position={[0.72, 1.18, 0.05]} castShadow>
        <boxGeometry args={[0.16, 0.3, 0.05]} />
        <meshStandardMaterial color="#dfe4e4" roughness={0.95} />
      </mesh>
    </group>
  )
}

/**
 * Heated towel rail with a live "warming" state driven by the bathroom fan? No -
 * it is decorative and static; the interactive bathroom devices are the light,
 * mirror light, exhaust and shower.
 */
export function TowelWarmer({ position = [4.32, 0, -4.4], rotation = [0, Math.PI / 2, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      {[0.5, 0.72, 0.94, 1.16].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.014, 0.014, 0.5, 10]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
      ))}
      {[-0.25, 0.25].map((x) => (
        <mesh key={x} position={[x, 0.83, 0]} castShadow>
          <cylinderGeometry args={[0.016, 0.016, 0.8, 10]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
      ))}
      {/* draped towel */}
      <mesh position={[0.1, 1.05, 0.03]} castShadow>
        <boxGeometry args={[0.34, 0.5, 0.06]} />
        <meshStandardMaterial color="#c9d4d8" roughness={0.95} />
      </mesh>
    </group>
  )
}

/** Bath mat in front of the shower/vanity. */
export function BathMat({ position = [6.2, 0.008, -7.4], size = [1.1, 0.7] }) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={size} />
      <meshStandardMaterial color="#b9c8cd" roughness={1} />
    </mesh>
  )
}

/**
 * Entry console in the hallway: keys bowl, letters, small plant. Decorative -
 * the interactive hallway devices are the lights, door, lock, doorbell and
 * entry sensor.
 */
export function HallConsole({ position = [-3.6, 0, 4.4], rotation = [0, Math.PI / 2, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[1.1, 0.04, 0.32]} radius={0.014} smoothness={3} position={[0, 0.8, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#8a6446" roughness={0.55} metalness={0.04} />
      </RoundedBox>
      {[[-0.5, 0.12], [0.5, 0.12], [-0.5, -0.12], [0.5, -0.12]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.4, z]} castShadow>
          <cylinderGeometry args={[0.018, 0.014, 0.78, 10]} />
          <meshStandardMaterial color="#3f2c20" roughness={0.5} metalness={0.1} />
        </mesh>
      ))}
      {/* keys bowl */}
      <group position={[-0.3, 0.84, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.1, 0.06, 0.06, 20]} />
          <meshStandardMaterial color="#cfd3cf" roughness={0.4} />
        </mesh>
        <mesh position={[0.03, 0.03, 0.02]} rotation={[0, 0.4, 0]}>
          <boxGeometry args={[0.08, 0.008, 0.02]} />
          <meshStandardMaterial color="#c9b277" roughness={0.3} metalness={0.85} />
        </mesh>
      </group>
      {/* letters */}
      <mesh position={[0.18, 0.83, 0.03]} rotation={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.24, 0.02, 0.16]} />
        <meshStandardMaterial color="#f1ece0" roughness={0.9} />
      </mesh>
      {/* small plant */}
      <group position={[0.42, 0.82, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.06, 0.05, 0.1, 16]} />
          <meshStandardMaterial color="#b9b0a2" roughness={0.85} />
        </mesh>
        {[-1, 0, 1].map((i) => (
          <mesh key={i} position={[i * 0.02, 0.14, 0]} rotation={[0, 0, i * 0.3]} castShadow>
            <sphereGeometry args={[0.06, 10, 8]} />
            <meshStandardMaterial color="#4f7f45" roughness={0.9} />
          </mesh>
        ))}
      </group>
      {/* mirror above */}
      <mesh position={[0, 1.7, -0.14]}>
        <boxGeometry args={[0.62, 0.86, 0.03]} />
        <meshStandardMaterial color="#6d4f38" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.7, -0.122]}>
        <planeGeometry args={[0.54, 0.78]} />
        <meshStandardMaterial color="#aebfc9" roughness={0.06} metalness={0.85} />
      </mesh>
    </group>
  )
}

/** Doormat at the main entrance. */
export function Doormat({ position = [2.6, 0.008, 5.0] }) {
  return (
    <group>
      <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1.1, 0.6]} />
        <meshStandardMaterial color="#6a5a48" roughness={1} />
      </mesh>
      <mesh position={[position[0], 0.01, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.7, 0.26]} />
        <meshStandardMaterial color="#574a3b" roughness={1} />
      </mesh>
    </group>
  )
}

/** Coat hooks panel next to the front door. */
export function CoatHooks({ position = [-3.7, 0, 5.2], rotation = [0, Math.PI / 2, 0] }) {
  const coats = [['#5d6f86', 0.1], ['#8a5f55', -0.24], ['#6f7d62', 0.42]]
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 1.75, 0]} castShadow>
        <boxGeometry args={[0.8, 0.24, 0.04]} />
        <meshStandardMaterial color="#6d4f38" roughness={0.7} />
      </mesh>
      {[-0.28, 0, 0.28].map((x) => (
        <mesh key={x} position={[x, 1.76, 0.05]} rotation={[Math.PI / 2.4, 0, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.012, 0.08, 8]} />
          <meshStandardMaterial color="#8f959c" roughness={0.3} metalness={0.85} />
        </mesh>
      ))}
      {coats.map(([color, x], i) => (
        <mesh key={i} position={[x, 1.4 - i * 0.04, 0.06]} rotation={[0, 0, (i - 1) * 0.12]} castShadow>
          <boxGeometry args={[0.26, 0.6 - i * 0.06, 0.1]} />
          <meshStandardMaterial color={color} roughness={0.95} />
        </mesh>
      ))}
      {/* umbrella */}
      <mesh position={[0.5, 0.5, 0.05]} rotation={[0, 0, 0.12]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.9, 10]} />
        <meshStandardMaterial color="#3a3f45" roughness={0.6} />
      </mesh>
    </group>
  )
}

/** Occupancy / water sensor bathroom wall mount — thin puck on the wall. */
export function SensorWallMount({ id, position, rotation = [0, 0, 0] }) {
  const device = useDevice(id)
  const ringRef = useRef()
  const active = sensorActive(device)

  useFrame((state) => {
    if (!ringRef.current) return
    const glow = active ? 2.4 + Math.sin(state.clock.elapsedTime * 5) * 1.3 : 0.15
    ringRef.current.emissiveIntensity += (glow - ringRef.current.emissiveIntensity) * 0.15
  })

  if (!device) return null

  return (
    <Clickable id={id} position={position} rotation={rotation} labelOffset={[0, 0.25, 0.15]} childrenHighlight={false}>
      <mesh castShadow>
        <boxGeometry args={[0.1, 0.1, 0.03]} />
        <meshStandardMaterial color="#f2f3f4" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.018]}>
        <circleGeometry args={[0.026, 18]} />
        <meshStandardMaterial
          ref={ringRef}
          color={active ? '#3a2408' : '#0a2a20'}
          emissive={active ? '#ffb04c' : '#7dffbf'}
          emissiveIntensity={0.15}
          toneMapped={false}
        />
      </mesh>
      {/* lens */}
      <mesh position={[0, -0.045, 0.017]}>
        <circleGeometry args={[0.012, 14]} />
        <meshStandardMaterial color="#2b3138" roughness={0.2} metalness={0.5} />
      </mesh>
    </Clickable>
  )
}
