import { RoundedBox } from '@react-three/drei'

/**
 * Upholstered three-seat sofa facing the TV wall, with cushions, arms and
 * wooden legs. Purely decorative (no device state) but it grounds the room.
 *
 * Local space: the seat faces +Z (the back frame sits at -Z). The living room
 * places the TV to the north (-Z), so the room rotates the sofa by PI to seat
 * people looking at the screen.
 */
export function Sofa({ position = [0, 0, 2.0], rotation = [0, 0, 0] }) {
  const fabric = { color: '#3f5f6b', roughness: 0.96, metalness: 0 }
  const cushion = { color: '#496d7a', roughness: 0.98, metalness: 0 }
  const legColor = '#4a3627'

  return (
    <group position={position} rotation={rotation}>
      {/* plinth / base */}
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.44, 0.16, 0.98]} />
        <meshStandardMaterial {...fabric} color="#37535e" />
      </mesh>

      {/* seat frame */}
      <mesh position={[0, 0.34, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 0.22, 0.95]} />
        <meshStandardMaterial {...fabric} />
      </mesh>

      {/* seat cushions */}
      {[-0.62, 0, 0.62].map((x) => (
        <RoundedBox key={x} args={[0.74, 0.19, 0.8]} radius={0.06} smoothness={4} position={[x, 0.53, 0.03]} castShadow receiveShadow>
          <meshStandardMaterial {...cushion} />
        </RoundedBox>
      ))}

      {/* back frame */}
      <mesh position={[0, 0.68, -0.42]} rotation={[-0.12, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 0.72, 0.2]} />
        <meshStandardMaterial {...fabric} />
      </mesh>

      {/* back cushions */}
      {[-0.6, 0, 0.6].map((x) => (
        <RoundedBox key={`b-${x}`} args={[0.72, 0.5, 0.18]} radius={0.07} smoothness={4} position={[x, 0.72, -0.26]} rotation={[-0.13, 0, 0]} castShadow>
          <meshStandardMaterial {...cushion} />
        </RoundedBox>
      ))}

      {/* arms */}
      {[-1.19, 1.19].map((x) => (
        <RoundedBox key={`a-${x}`} args={[0.24, 0.52, 0.96]} radius={0.09} smoothness={4} position={[x, 0.46, 0]} castShadow receiveShadow>
          <meshStandardMaterial {...fabric} color="#3a5864" />
        </RoundedBox>
      ))}

      {/* decorative throw cushions */}
      <RoundedBox args={[0.34, 0.34, 0.12]} radius={0.05} smoothness={4} position={[-0.86, 0.72, -0.16]} rotation={[-0.32, 0.25, 0.12]} castShadow>
        <meshStandardMaterial color="#c98a52" roughness={0.95} />
      </RoundedBox>
      <RoundedBox args={[0.34, 0.34, 0.12]} radius={0.05} smoothness={4} position={[0.86, 0.72, -0.16]} rotation={[-0.32, -0.22, -0.14]} castShadow>
        <meshStandardMaterial color="#e6ddcb" roughness={0.95} />
      </RoundedBox>

      {/* folded blanket */}
      <RoundedBox args={[0.6, 0.08, 0.5]} radius={0.035} smoothness={3} position={[-1.0, 0.62, 0.14]} rotation={[0, 0.08, 0]} castShadow>
        <meshStandardMaterial color="#8b6b52" roughness={1} />
      </RoundedBox>

      {/* legs */}
      {[[-1.05, 0.42], [1.05, 0.42], [-1.05, -0.4], [1.05, -0.4]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.05, z]} castShadow>
          <cylinderGeometry args={[0.03, 0.022, 0.1, 12]} />
          <meshStandardMaterial color={legColor} roughness={0.5} metalness={0.15} />
        </mesh>
      ))}
    </group>
  )
}
