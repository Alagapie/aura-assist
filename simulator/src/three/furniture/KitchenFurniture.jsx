import { RoundedBox } from '@react-three/drei'
import { DINING_TABLE, SEATING } from '../../config/house'

const CABINET = { color: '#5c6b60', roughness: 0.6, metalness: 0.05 }
const CABINET_UPPER = { color: '#e8e4db', roughness: 0.6, metalness: 0.03 }
const WORKTOP = { color: '#33383d', roughness: 0.35, metalness: 0.15 }
const METAL = { color: '#a8b0b8', roughness: 0.28, metalness: 0.88 }

/**
 * Kitchen run: base cabinets + worktop + wall cabinets + backsplash. `length`
 * stretches the whole unit along local X; the sink cut-out sits at `sinkAt`.
 */
export function KitchenRun({ position = [4.45, 0, -2.72], rotation = [0, 0, 0], length = 4.4 }) {
  const baseDoors = Math.max(2, Math.round(length / 0.75))
  const doorW = length / baseDoors

  return (
    <group position={position} rotation={rotation}>
      {/* backsplash */}
      <mesh position={[length / 2, 1.05, -0.01]} receiveShadow>
        <boxGeometry args={[length + 0.1, 0.5, 0.03]} />
        <meshStandardMaterial color="#dfe3e6" roughness={0.4} metalness={0.05} />
      </mesh>

      {/* base cabinets */}
      <mesh position={[length / 2, 0.45, 0.3]} castShadow receiveShadow>
        <boxGeometry args={[length, 0.88, 0.6]} />
        <meshStandardMaterial {...CABINET} />
      </mesh>
      {/* doors + handles */}
      {Array.from({ length: baseDoors }).map((_, i) => (
        <group key={i}>
          <mesh position={[doorW * (i + 0.5), 0.45, 0.605]}>
            <boxGeometry args={[doorW - 0.04, 0.82, 0.015]} />
            <meshStandardMaterial color="#516055" roughness={0.55} />
          </mesh>
          <mesh position={[doorW * (i + 0.5), 0.78, 0.62]}>
            <boxGeometry args={[doorW * 0.5, 0.02, 0.025]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
        </group>
      ))}
      {/* plinth */}
      <mesh position={[length / 2, 0.05, 0.56]}>
        <boxGeometry args={[length - 0.06, 0.1, 0.05]} />
        <meshStandardMaterial color="#2c342e" roughness={0.8} />
      </mesh>

      {/* worktop */}
      <mesh position={[length / 2, 0.91, 0.31]} castShadow receiveShadow>
        <boxGeometry args={[length + 0.04, 0.05, 0.66]} />
        <meshStandardMaterial {...WORKTOP} />
      </mesh>

      {/* sink basin (recessed look) */}
      <mesh position={[length * 0.72, 0.915, 0.32]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.6, 0.42]} />
        <meshStandardMaterial color="#1d2126" roughness={0.3} metalness={0.6} />
      </mesh>
      <mesh position={[length * 0.72, 0.9, 0.32]}>
        <boxGeometry args={[0.56, 0.08, 0.38]} />
        <meshStandardMaterial color="#8f979f" roughness={0.3} metalness={0.85} />
      </mesh>
      {/* faucet */}
      <mesh position={[length * 0.72, 1.06, 0.08]} castShadow>
        <cylinderGeometry args={[0.018, 0.022, 0.3, 12]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position={[length * 0.72, 1.2, 0.18]} rotation={[Math.PI / 2.4, 0, 0]}>
        <cylinderGeometry args={[0.016, 0.016, 0.24, 12]} />
        <meshStandardMaterial {...METAL} />
      </mesh>

      {/* upper cabinets (leave a gap over the hob) */}
      <group>
        <mesh position={[length * 0.2, 1.95, 0.14]} castShadow>
          <boxGeometry args={[length * 0.4, 0.72, 0.34]} />
          <meshStandardMaterial {...CABINET_UPPER} />
        </mesh>
        {[0, 1].map((i) => (
          <mesh key={i} position={[length * 0.2 + (i === 0 ? -0.45 : 0.45), 1.95, 0.32]}>
            <boxGeometry args={[0.86, 0.66, 0.015]} />
            <meshStandardMaterial color="#f0ece3" roughness={0.55} />
          </mesh>
        ))}
        <mesh position={[length * 0.88, 1.95, 0.14]} castShadow>
          <boxGeometry args={[length * 0.2, 0.72, 0.34]} />
          <meshStandardMaterial {...CABINET_UPPER} />
        </mesh>
        <mesh position={[length * 0.88, 1.95, 0.32]}>
          <boxGeometry args={[length * 0.2 - 0.04, 0.66, 0.015]} />
          <meshStandardMaterial color="#f0ece3" roughness={0.55} />
        </mesh>
        {/* handles */}
        {[length * 0.2 - 0.45, length * 0.2 + 0.45, length * 0.88].map((x) => (
          <mesh key={x} position={[x, 1.66, 0.34]}>
            <boxGeometry args={[0.2, 0.02, 0.025]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/**
 * Round dining table with two chairs (kitchen nook).
 *
 * The chairs are not hard-coded here: they come from the shared seating plan
 * (config/house.js), which is also what the automated test uses to prove each
 * chair faces the table. `position` is the table anchor, so the world-space
 * chair positions are converted to local offsets by subtracting it.
 */
export function DiningSet({ position = DINING_TABLE.position }) {
  const localOf = (world) => [world[0] - position[0], 0, world[2] - position[2]]

  const chair = ({ id, position: world, rotationY }) => {
    const [x, z] = localOf(world)
    return (
      <group key={id} position={[x, 0, z]} rotation={[0, rotationY, 0]}>
        <RoundedBox args={[0.42, 0.05, 0.42]} radius={0.02} smoothness={3} position={[0, 0.46, 0]} castShadow>
          <meshStandardMaterial color="#8a6446" roughness={0.6} />
        </RoundedBox>
        {/* back rest sits at local -Z, so a sitter looks along +Z */}
        <mesh position={[0, 0.72, -0.19]} castShadow>
          <boxGeometry args={[0.4, 0.5, 0.04]} />
          <meshStandardMaterial color="#6d4f38" roughness={0.65} />
        </mesh>
        {[[-0.17, 0.17], [0.17, 0.17], [-0.17, -0.17], [0.17, -0.17]].map(([lx, lz]) => (
          <mesh key={`${lx}${lz}`} position={[lx, 0.22, lz]} castShadow>
            <cylinderGeometry args={[0.016, 0.013, 0.44, 8]} />
            <meshStandardMaterial color="#3f2c20" roughness={0.5} metalness={0.1} />
          </mesh>
        ))}
      </group>
    )
  }

  const chairs = SEATING.filter((plan) => plan.room === DINING_TABLE.room).map((plan) => plan.seat)

  return (
    <group position={position}>
      {/* table */}
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.62, 0.62, 0.05, 32]} />
        <meshStandardMaterial color="#9a7350" roughness={0.5} metalness={0.04} />
      </mesh>
      <mesh position={[0, 0.37, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.1, 0.72, 16]} />
        <meshStandardMaterial color="#4a3527" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.34, 0.04, 24]} />
        <meshStandardMaterial color="#4a3527" roughness={0.55} />
      </mesh>
      {/* centrepiece: fruit bowl */}
      <group position={[0, 0.79, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.16, 0.1, 0.08, 22]} />
          <meshStandardMaterial color="#cfd3cf" roughness={0.35} metalness={0.05} />
        </mesh>
        {[[-0.05, 0.02, '#e0a23c'], [0.05, -0.03, '#c94f3f'], [0.01, 0.06, '#87a04a']].map(([x, z, c], i) => (
          <mesh key={i} position={[x, 0.07, z]} castShadow>
            <sphereGeometry args={[0.05, 12, 10]} />
            <meshStandardMaterial color={c} roughness={0.6} />
          </mesh>
        ))}
      </group>
      {/* mugs */}
      {[[-0.3, 0.24], [0.34, -0.18]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.79, z]} castShadow>
          <cylinderGeometry args={[0.04, 0.035, 0.09, 16]} />
          <meshStandardMaterial color={i === 0 ? '#e8e2d6' : '#7d95a8'} roughness={0.4} />
        </mesh>
      ))}
      {chairs.map(chair)}
    </group>
  )
}

/** Wall calendar / notice board for the kitchen. */
export function NoticeBoard({ position = [8.94, 1.7, 1.6], rotation = [0, -Math.PI / 2, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[0.6, 0.44, 0.03]} />
        <meshStandardMaterial color="#7a5b3c" roughness={0.75} />
      </mesh>
      {[[-0.16, 0.06], [0.1, 0.1], [0.14, -0.12], [-0.1, -0.14]].map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.02]} rotation={[0, 0, (i - 1.5) * 0.08]}>
          <planeGeometry args={[0.16, 0.2]} />
          <meshStandardMaterial color={['#f3efe4', '#ffe9c4', '#e4f0ff', '#f8e0e0'][i]} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}
