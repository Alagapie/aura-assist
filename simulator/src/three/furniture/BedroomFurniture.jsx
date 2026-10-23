import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { Clickable } from '../helpers/Clickable'
import { useDevice } from '../../store/useRoomStore'

const WOOD = { color: '#8a6446', roughness: 0.55, metalness: 0.04 }
const WOOD_DARK = { color: '#5f4330', roughness: 0.6, metalness: 0.04 }
const METAL = { color: '#8f959c', roughness: 0.3, metalness: 0.85 }

/**
 * Double bed with slatted oak frame, layered duvet and pillows. The headboard
 * sits against the wall at the group's origin; the bed extends along +Z by
 * default (rotate the group to place it against other walls).
 */
export function Bed({ position = [1.3, 0, -3.3], rotation = [0, 0, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      {/* headboard */}
      <RoundedBox args={[1.74, 1.1, 0.08]} radius={0.03} smoothness={3} position={[0, 0.62, -1.04]} castShadow receiveShadow>
        <meshStandardMaterial color="#6d4f38" roughness={0.7} />
      </RoundedBox>
      {/* frame rails */}
      <mesh position={[0, 0.24, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.7, 0.24, 2.1]} />
        <meshStandardMaterial {...WOOD} />
      </mesh>
      {/* legs */}
      {[[-0.78, -0.96], [0.78, -0.96], [-0.78, 0.96], [0.78, 0.96]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.1, z]} castShadow>
          <boxGeometry args={[0.07, 0.2, 0.07]} />
          <meshStandardMaterial {...WOOD_DARK} />
        </mesh>
      ))}
      {/* mattress */}
      <RoundedBox args={[1.6, 0.26, 1.98]} radius={0.05} smoothness={3} position={[0, 0.48, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f1ede4" roughness={0.9} />
      </RoundedBox>
      {/* duvet */}
      <RoundedBox args={[1.66, 0.16, 1.5]} radius={0.06} smoothness={3} position={[0, 0.63, 0.24]} castShadow receiveShadow>
        <meshStandardMaterial color="#b9c4c9" roughness={0.95} />
      </RoundedBox>
      {/* folded blanket */}
      <RoundedBox args={[1.66, 0.07, 0.44]} radius={0.03} smoothness={3} position={[0, 0.7, 0.78]} castShadow>
        <meshStandardMaterial color="#8d9aa1" roughness={0.95} />
      </RoundedBox>
      {/* pillows */}
      {[-0.42, 0.42].map((x) => (
        <RoundedBox key={x} args={[0.62, 0.16, 0.4]} radius={0.07} smoothness={3} position={[x, 0.68, -0.7]} rotation={[0.12, x > 0 ? -0.08 : 0.08, 0]} castShadow>
          <meshStandardMaterial color="#f6f2ea" roughness={0.95} />
        </RoundedBox>
      ))}
      {/* throw pillows */}
      {[[-0.2, '#c9b79c'], [0.2, '#a9b6a0']].map(([x, color]) => (
        <RoundedBox key={x} args={[0.34, 0.14, 0.3]} radius={0.06} smoothness={3} position={[x, 0.75, -0.48]} rotation={[0.2, 0, 0]} castShadow>
          <meshStandardMaterial color={color} roughness={0.9} />
        </RoundedBox>
      ))}
    </group>
  )
}

/** Small bedside table with a drawer and an open shelf. */
export function BedsideTable({ position = [0.3, 0, -3.35], rotation = [0, 0, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[0.46, 0.5, 0.4]} radius={0.02} smoothness={3} position={[0, 0.3, 0]} castShadow receiveShadow>
        <meshStandardMaterial {...WOOD_DARK} />
      </RoundedBox>
      {/* drawer front */}
      <mesh position={[0, 0.4, 0.202]}>
        <boxGeometry args={[0.4, 0.16, 0.01]} />
        <meshStandardMaterial color="#6a4c36" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.4, 0.212]}>
        <boxGeometry args={[0.12, 0.02, 0.02]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      {/* open shelf gap */}
      <mesh position={[0, 0.2, 0.202]}>
        <boxGeometry args={[0.4, 0.12, 0.01]} />
        <meshStandardMaterial color="#41301f" roughness={0.8} />
      </mesh>
      {/* legs */}
      {[[-0.18, 0.15], [0.18, 0.15], [-0.18, -0.15], [0.18, -0.15]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.05, z]} castShadow>
          <boxGeometry args={[0.05, 0.1, 0.05]} />
          <meshStandardMaterial {...WOOD_DARK} />
        </mesh>
      ))}
      {/* book + glass on top */}
      <mesh position={[-0.08, 0.565, 0.02]} rotation={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.2, 0.03, 0.15]} />
        <meshStandardMaterial color="#48607a" roughness={0.85} />
      </mesh>
      <mesh position={[0.12, 0.57, -0.04]} castShadow>
        <cylinderGeometry args={[0.04, 0.035, 0.1, 16]} />
        <meshStandardMaterial color="#dfe8ea" roughness={0.15} metalness={0.05} transparent opacity={0.7} />
      </mesh>
    </group>
  )
}

/**
 * Two-door wardrobe. Clicking a door device (`wardrobeDoor`) swings both
 * leaves open, revealing shelves and hanging space with a warm auto-light.
 */
export function Wardrobe({ position = [-3.6, 0, -7.4], rotation = [0, Math.PI / 2, 0] }) {
  const device = useDevice('wardrobeDoor')
  const leftRef = useRef()
  const rightRef = useRef()
  const lightRef = useRef()

  useFrame((_, delta) => {
    const k = Math.min(1, delta * 4.5)
    const open = device?.open
    if (leftRef.current) leftRef.current.rotation.y += ((open ? 1.35 : 0) - leftRef.current.rotation.y) * k
    if (rightRef.current) rightRef.current.rotation.y += ((open ? -1.35 : 0) - rightRef.current.rotation.y) * k
    if (lightRef.current) lightRef.current.intensity += ((open ? 4 : 0) - lightRef.current.intensity) * k
  })

  if (!device) return null

  const W = 1.8

  return (
    <Clickable id="wardrobeDoor" position={position} rotation={rotation} labelOffset={[0, 2.2, 0.4]} childrenHighlight={false}>
      {/* carcass */}
      <mesh position={[0, 1.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[W, 2.16, 0.6]} />
        <meshStandardMaterial color="#71543c" roughness={0.62} />
      </mesh>
      {/* interior */}
      <mesh position={[0, 1.08, 0.26]}>
        <boxGeometry args={[W - 0.1, 2.06, 0.02]} />
        <meshStandardMaterial color="#4a382a" roughness={0.85} />
      </mesh>
      {/* shelf + rail + clothes */}
      <mesh position={[0, 1.9, 0.1]}>
        <boxGeometry args={[W - 0.12, 0.03, 0.42]} />
        <meshStandardMaterial {...WOOD_DARK} />
      </mesh>
      <mesh position={[0, 1.62, 0.05]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.012, 0.012, W - 0.16, 10]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      {[-0.6, -0.35, -0.1, 0.15, 0.4].map((x, i) => (
        <mesh key={x} position={[x, 1.36, 0.05]} castShadow>
          <boxGeometry args={[0.16, 0.52, 0.24]} />
          <meshStandardMaterial color={['#5d6f86', '#8a5f55', '#6f7d62', '#96866e', '#4f5a6b'][i]} roughness={0.9} />
        </mesh>
      ))}
      {/* lower shelf with folded items */}
      <mesh position={[0, 0.62, 0.1]}>
        <boxGeometry args={[W - 0.12, 0.03, 0.42]} />
        <meshStandardMaterial {...WOOD_DARK} />
      </mesh>
      {[0.7, 0.79, 0.88].map((y, i) => (
        <mesh key={y} position={[0.4, y, 0.1]}>
          <boxGeometry args={[0.5, 0.07, 0.34]} />
          <meshStandardMaterial color={['#cfc7b8', '#9fb0bf', '#c8b2a4'][i]} roughness={0.95} />
        </mesh>
      ))}
      <pointLight ref={lightRef} position={[0, 1.7, 0.15]} intensity={0} distance={2.4} color="#ffe9c4" />

      {/* doors (hinged at the outer edges) */}
      <group ref={leftRef} position={[-W / 2, 0, 0.3]}>
        <mesh position={[W / 4, 1.08, 0]} castShadow>
          <boxGeometry args={[W / 2 - 0.02, 2.14, 0.04]} />
          <meshStandardMaterial color="#7d5f45" roughness={0.6} />
        </mesh>
        {/* panel inlay */}
        <mesh position={[W / 4, 1.08, 0.026]}>
          <boxGeometry args={[W / 2 - 0.14, 1.9, 0.012]} />
          <meshStandardMaterial color="#6a4f39" roughness={0.7} />
        </mesh>
        <mesh position={[W / 2 - 0.09, 1.08, 0.045]}>
          <boxGeometry args={[0.025, 0.34, 0.03]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
      </group>
      <group ref={rightRef} position={[W / 2, 0, 0.3]}>
        <mesh position={[-W / 4, 1.08, 0]} castShadow>
          <boxGeometry args={[W / 2 - 0.02, 2.14, 0.04]} />
          <meshStandardMaterial color="#7d5f45" roughness={0.6} />
        </mesh>
        <mesh position={[-W / 4, 1.08, 0.026]}>
          <boxGeometry args={[W / 2 - 0.14, 1.9, 0.012]} />
          <meshStandardMaterial color="#6a4f39" roughness={0.7} />
        </mesh>
        <mesh position={[-W / 2 + 0.09, 1.08, 0.045]}>
          <boxGeometry args={[0.025, 0.34, 0.03]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
      </group>
    </Clickable>
  )
}

/** Low bench at the foot of the bed / window seat. */
export function BedroomBench({ position = [1.3, 0, -6.6] }) {
  return (
    <group position={position}>
      <RoundedBox args={[1.3, 0.14, 0.44]} radius={0.05} smoothness={3} position={[0, 0.42, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#a89a86" roughness={0.95} />
      </RoundedBox>
      {[[-0.55, 0.14], [0.55, 0.14], [-0.55, -0.14], [0.55, -0.14]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.19, z]} castShadow>
          <cylinderGeometry args={[0.02, 0.016, 0.38, 10]} />
          <meshStandardMaterial color="#3f2c20" roughness={0.5} metalness={0.1} />
        </mesh>
      ))}
    </group>
  )
}
