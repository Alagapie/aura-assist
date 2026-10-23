import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { createRugTexture, createArtTexture } from '../helpers/textures'

const WOOD = { color: '#8a6446', roughness: 0.55, metalness: 0.04 }
const WOOD_DARK = { color: '#5f4330', roughness: 0.6, metalness: 0.04 }
const METAL = { color: '#8f959c', roughness: 0.3, metalness: 0.85 }

/* ------------------------------ coffee table ------------------------------ */

export function CoffeeTable({ position = [0, 0, 0.55] }) {
  return (
    <group position={position}>
      <RoundedBox args={[1.24, 0.055, 0.64]} radius={0.02} smoothness={3} position={[0, 0.42, 0]} castShadow receiveShadow>
        <meshStandardMaterial {...WOOD} />
      </RoundedBox>
      <RoundedBox args={[1.06, 0.03, 0.5]} radius={0.014} smoothness={3} position={[0, 0.16, 0]} castShadow receiveShadow>
        <meshStandardMaterial {...WOOD_DARK} />
      </RoundedBox>
      {[[-0.56, 0.26], [0.56, 0.26], [-0.56, -0.26], [0.56, -0.26]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.2, z]} castShadow>
          <cylinderGeometry args={[0.022, 0.018, 0.4, 10]} />
          <meshStandardMaterial color="#3f2c20" roughness={0.5} metalness={0.1} />
        </mesh>
      ))}

      {/* styling: books + mug + remote */}
      <group position={[-0.32, 0.45, 0.02]} rotation={[0, 0.18, 0]}>
        <RoundedBox args={[0.3, 0.028, 0.22]} radius={0.006} smoothness={2} position={[0, 0, 0]} castShadow>
          <meshStandardMaterial color="#2f4858" roughness={0.8} />
        </RoundedBox>
        <RoundedBox args={[0.28, 0.026, 0.2]} radius={0.006} smoothness={2} position={[0.01, 0.03, 0.01]} castShadow>
          <meshStandardMaterial color="#c0643f" roughness={0.8} />
        </RoundedBox>
        <RoundedBox args={[0.26, 0.024, 0.19]} radius={0.006} smoothness={2} position={[-0.01, 0.058, 0.02]} castShadow>
          <meshStandardMaterial color="#e3dccb" roughness={0.85} />
        </RoundedBox>
      </group>

      {/* mug */}
      <group position={[0.3, 0.45, 0.1]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.045, 0.038, 0.1, 20]} />
          <meshStandardMaterial color="#f2efe8" roughness={0.42} />
        </mesh>
        <mesh position={[0.055, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.026, 0.007, 8, 16, Math.PI * 1.4]} />
          <meshStandardMaterial color="#f2efe8" roughness={0.42} />
        </mesh>
      </group>
      {/* the interactive TV remote lives here (see rooms/LivingRoom.jsx) */}
    </group>
  )
}

/* --------------------------------- TV stand -------------------------------- */

export function TvStand({ position = [0, 0, -2.72] }) {
  return (
    <group position={position}>
      <RoundedBox args={[2.2, 0.05, 0.46]} radius={0.015} smoothness={3} position={[0, 0.5, 0]} castShadow receiveShadow>
        <meshStandardMaterial {...WOOD_DARK} />
      </RoundedBox>
      <mesh position={[0, 0.26, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.1, 0.44, 0.42]} />
        <meshStandardMaterial color="#3a2a20" roughness={0.65} metalness={0.05} />
      </mesh>
      {/* cabinet door seams + handles */}
      {[-0.53, 0.53].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.26, 0.212]}>
            <boxGeometry args={[1.0, 0.4, 0.012]} />
            <meshStandardMaterial color="#433125" roughness={0.6} />
          </mesh>
          <mesh position={[x + (x < 0 ? 0.42 : -0.42), 0.26, 0.23]}>
            <boxGeometry args={[0.035, 0.1, 0.02]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
        </group>
      ))}
      {[[-1.0, 0.17], [1.0, 0.17], [-1.0, -0.17], [1.0, -0.17]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.035, z]} castShadow>
          <boxGeometry args={[0.05, 0.07, 0.05]} />
          <meshStandardMaterial color="#241a13" roughness={0.6} />
        </mesh>
      ))}

      {/* soundbar on top */}
      <RoundedBox args={[0.9, 0.075, 0.09]} radius={0.03} smoothness={3} position={[0, 0.565, 0.12]} castShadow>
        <meshStandardMaterial color="#2a2d31" roughness={0.5} metalness={0.35} />
      </RoundedBox>
      <mesh position={[0, 0.605, 0.12]}>
        <planeGeometry args={[0.8, 0.05]} />
        <meshStandardMaterial color="#1b1e21" roughness={0.9} />
      </mesh>

      {/* console decor: media boxes + small plant */}
      <mesh position={[-0.72, 0.55, 0.02]} rotation={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.24, 0.08, 0.16]} />
        <meshStandardMaterial color="#20242a" roughness={0.6} />
      </mesh>
      <group position={[0.78, 0.53, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.055, 0.045, 0.11, 16]} />
          <meshStandardMaterial color="#c8a184" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.14, 0]} castShadow>
          <sphereGeometry args={[0.09, 12, 10]} />
          <meshStandardMaterial color="#4f7a45" roughness={0.9} />
        </mesh>
      </group>
    </group>
  )
}

/* -------------------------------- side table ------------------------------- */

export function SideTable({ position = [1.85, 0, 1.55] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.54, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.27, 0.27, 0.04, 30]} />
        <meshStandardMaterial {...WOOD} />
      </mesh>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.02, 24]} />
        <meshStandardMaterial {...WOOD_DARK} />
      </mesh>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 0.18, 0.27, Math.sin(a) * 0.18]} castShadow>
            <cylinderGeometry args={[0.016, 0.012, 0.54, 10]} />
            <meshStandardMaterial color="#3f2c20" roughness={0.5} metalness={0.12} />
          </mesh>
        )
      })}
    </group>
  )
}

/* ------------------------------ console table ------------------------------ */

export function ConsoleTable({ position = [0.9, 0, 2.74] }) {
  return (
    <group position={position}>
      <RoundedBox args={[1.4, 0.045, 0.34]} radius={0.014} smoothness={3} position={[0, 0.78, 0]} castShadow receiveShadow>
        <meshStandardMaterial {...WOOD} />
      </RoundedBox>
      {[[-0.62, 0.13], [0.62, 0.13], [-0.62, -0.13], [0.62, -0.13]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.39, z]} castShadow>
          <cylinderGeometry args={[0.02, 0.016, 0.78, 10]} />
          <meshStandardMaterial color="#3f2c20" roughness={0.5} metalness={0.12} />
        </mesh>
      ))}
      <mesh position={[0, 0.85, 0]} castShadow>
        <boxGeometry args={[1.3, 0.025, 0.3]} />
        <meshStandardMaterial {...WOOD_DARK} />
      </mesh>

      {/* vase with stems */}
      <group position={[-0.42, 0.87, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.07, 0.105, 0.3, 22]} />
          <meshStandardMaterial color="#cfd3cf" roughness={0.35} metalness={0.05} />
        </mesh>
        <mesh position={[0, 0.06, 0]}>
          <sphereGeometry args={[0.11, 16, 12]} />
          <meshStandardMaterial color="#cfd3cf" roughness={0.35} />
        </mesh>
        {[-1, 0, 1].map((i) => (
          <group key={i} rotation={[0, 0, i * 0.22]}>
            <mesh position={[0, 0.34, 0]} castShadow>
              <cylinderGeometry args={[0.005, 0.005, 0.4, 6]} />
              <meshStandardMaterial color="#4d6b3f" roughness={0.9} />
            </mesh>
            <mesh position={[i * 0.02, 0.55, 0]} castShadow>
              <sphereGeometry args={[0.06, 10, 8]} />
              <meshStandardMaterial color="#5b7f46" roughness={0.92} />
            </mesh>
          </group>
        ))}
      </group>

      {/* framed photo */}
      <group position={[0.34, 0.86, 0.02]} rotation={[0, -0.18, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.2, 0.26, 0.015]} />
          <meshStandardMaterial color="#2b2b2f" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.009]}>
          <planeGeometry args={[0.16, 0.22]} />
          <meshStandardMaterial color="#9fb6c4" roughness={0.4} />
        </mesh>
      </group>

      {/* stacked candles */}
      {[0, 1].map((i) => (
        <mesh key={i} position={[0.68, 0.815 + i * 0.1, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.09, 16]} />
          <meshStandardMaterial color={i === 0 ? '#e8dcc6' : '#d8c1a0'} roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

/* ----------------------------------- rug ---------------------------------- */

export function Rug({ position = [0, 0.007, 0.42], size = [3.7, 2.9] }) {
  const texture = useMemo(() => createRugTexture(), [])
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={size} />
      <meshStandardMaterial map={texture} roughness={1} metalness={0} envMapIntensity={0.25} />
    </mesh>
  )
}

/* ---------------------------------- plant --------------------------------- */

export function Plant({ position = [-3.38, 0, -2.3], scale = 1 }) {
  const leaves = useMemo(
    () => Array.from({ length: 9 }, (_, i) => ({
      angle: (i / 9) * Math.PI * 2 + Math.random() * 0.4,
      tilt: 0.5 + Math.random() * 0.5,
      len: 0.34 + Math.random() * 0.24,
      h: 0.5 + Math.random() * 0.5,
    })),
    [],
  )
  return (
    <group position={position} scale={scale}>
      {/* pot */}
      <mesh position={[0, 0.17, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.15, 0.34, 24]} />
        <meshStandardMaterial color="#b9b0a2" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.345, 0]} receiveShadow>
        <cylinderGeometry args={[0.19, 0.19, 0.02, 24]} />
        <meshStandardMaterial color="#3c3128" roughness={1} />
      </mesh>
      {/* foliage */}
      {leaves.map((leaf, i) => (
        <group key={i} rotation={[0, leaf.angle, 0]}>
          <mesh position={[leaf.len * 0.45, leaf.h, 0]} rotation={[0, 0, -leaf.tilt]} castShadow>
            <sphereGeometry args={[leaf.len * 0.55, 10, 8]} />
            <meshStandardMaterial color={i % 3 === 0 ? '#3f6b41' : '#4f7f45'} roughness={0.9} />
          </mesh>
          <mesh position={[leaf.len * 0.2, leaf.h * 0.62, 0]} rotation={[0, 0, -leaf.tilt * 0.6]}>
            <cylinderGeometry args={[0.007, 0.009, leaf.h * 0.8, 6]} />
            <meshStandardMaterial color="#42663a" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* -------------------------------- wall art --------------------------------- */

export function WallArt({ position = [-3.15, 1.72, -2.94], variant = 0, size = [0.62, 0.82], rotation = [0, 0, 0] }) {
  const texture = useMemo(() => createArtTexture(variant), [variant])
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[size[0], size[1], 0.035]} />
        <meshStandardMaterial color="#241f1b" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[size[0] - 0.08, size[1] - 0.08]} />
        <meshStandardMaterial map={texture} roughness={0.75} />
      </mesh>
    </group>
  )
}

/* ---------------------------------- clock --------------------------------- */

export function WallClock({ position = [-1.7, 2.06, 2.94], rotation = [0, Math.PI, 0] }) {
  const minuteRef = useRef()
  const hourRef = useRef()
  const secondRef = useRef()

  useFrame((state) => {
    const now = new Date()
    const seconds = now.getSeconds() + (state.clock.elapsedTime % 1)
    const minutes = now.getMinutes() + seconds / 60
    const hours = (now.getHours() % 12) + minutes / 60
    if (secondRef.current) secondRef.current.rotation.z = -(seconds / 60) * Math.PI * 2
    if (minuteRef.current) minuteRef.current.rotation.z = -(minutes / 60) * Math.PI * 2
    if (hourRef.current) hourRef.current.rotation.z = -(hours / 12) * Math.PI * 2
  })

  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <cylinderGeometry args={[0.19, 0.19, 0.035, 32]} />
        <meshStandardMaterial color="#20232a" roughness={0.4} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0, 0.021]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.168, 32]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.55} />
      </mesh>
      {/* hands (pivot at the dial centre) */}
      <group ref={hourRef} position={[0, 0, 0.028]}>
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[0.016, 0.1, 0.004]} />
          <meshStandardMaterial color="#23262c" roughness={0.5} />
        </mesh>
      </group>
      <group ref={minuteRef} position={[0, 0, 0.031]}>
        <mesh position={[0, 0.07, 0]}>
          <boxGeometry args={[0.012, 0.14, 0.004]} />
          <meshStandardMaterial color="#23262c" roughness={0.5} />
        </mesh>
      </group>
      <group ref={secondRef} position={[0, 0, 0.034]}>
        <mesh position={[0, 0.075, 0]}>
          <boxGeometry args={[0.005, 0.15, 0.003]} />
          <meshStandardMaterial color="#c0643f" roughness={0.5} />
        </mesh>
      </group>
      {/* markers */}
      {[0, 3, 6, 9].map((i) => (
        <mesh key={i} position={[Math.sin((i / 12) * Math.PI * 2) * 0.14, Math.cos((i / 12) * Math.PI * 2) * 0.14, 0.024]}>
          <boxGeometry args={[0.014, 0.014, 0.004]} />
          <meshStandardMaterial color="#23262c" />
        </mesh>
      ))}
    </group>
  )
}

/* --------------------------- slim bookshelf unit --------------------------- */

export function ShelfUnit({ position = [3.72, 0, 2.35], rotation = [0, -Math.PI / 2, 0] }) {
  const bookColors = ['#8a5a3b', '#3f6470', '#c0704a', '#5b6b8c', '#7f8f6a', '#b0453c']
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 1.8, 0.3]} />
        <meshStandardMaterial color="#4a3527" roughness={0.7} />
      </mesh>
      {[0.3, 0.72, 1.14, 1.56].map((y) => (
        <mesh key={y} position={[0, y, 0.02]}>
          <boxGeometry args={[0.94, 0.03, 0.28]} />
          <meshStandardMaterial {...WOOD_DARK} />
        </mesh>
      ))}
      {[0.3, 0.72, 1.14, 1.56].map((y, row) => (
        <group key={`books-${y}`} position={[-0.44, y + 0.03, 0.06]}>
          {Array.from({ length: 7 }).map((_, i) => {
            const w = 0.055 + (i % 3) * 0.012
            return (
              <mesh key={i} position={[i * 0.13 + 0.03, 0.11 + (i % 2) * 0.01, 0]} rotation={[0, 0, i === 6 ? 0.22 : 0]} castShadow>
                <boxGeometry args={[w, 0.22 - (i % 2) * 0.03, 0.2]} />
                <meshStandardMaterial color={bookColors[(i + row) % bookColors.length]} roughness={0.85} />
              </mesh>
            )
          })}
        </group>
      ))}
      {/* decorative object on top */}
      <mesh position={[0, 1.86, 0]} castShadow>
        <sphereGeometry args={[0.09, 18, 12]} />
        <meshStandardMaterial color="#cbb277" roughness={0.3} metalness={0.7} />
      </mesh>
    </group>
  )
}
