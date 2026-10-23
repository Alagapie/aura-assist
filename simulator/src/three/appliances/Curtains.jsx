import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Clickable } from '../helpers/Clickable'
import { useDevice } from '../../store/useRoomStore'

const GATHERED_WIDTH = 0.3
const FABRIC_X = 0.1 // fabric hangs just inside the wall plane
const ROD_X = 0.16

/** Soft vertical folds baked into the curtain fabric. */
function makeCurtainGeometry(width, height) {
  const geo = new THREE.PlaneGeometry(width, height, 46, 1)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const wave = Math.sin((x / width) * Math.PI * 9)
    const depth = (0.045 + Math.random() * 0.004) * wave
    pos.setZ(i, depth)
  }
  geo.computeVertexNormals()
  return geo
}

/**
 * Two-panel curtain over a window.
 *
 * The group origin sits on the wall plane, centred on the window, with local
 * +X pointing *into* the room (set `rotation` on the group when the wall runs
 * along a different axis). Panels close over the middle of the span and gather
 * to the outer edges when opened.
 *
 *   position = window centre on the wall (y = floor)
 *   rotation = yaw that points local +X into the room
 *   span     = total rod width
 *   height   = fabric height
 */
export function Curtains({
  id = 'curtains',
  position = [-4, 0, -0.7],
  rotation = [0, 0, 0],
  span = 3.0,
  height = 2.55,
}) {
  const device = useDevice(id)
  const progress = useRef(0) // 0 = closed, 1 = open
  const meshRefs = [useRef(), useRef()]

  const half = span / 2
  // closed panel extents along local Z (slight overlap at the centre)
  const panels = useMemo(() => [
    { z0: -half + 0.05, z1: 0.15, outer: -half, dir: 1 },
    { z0: 0.05, z1: half - 0.05, outer: half, dir: -1 },
  ], [half])

  const geometries = useMemo(
    () => panels.map((p) => makeCurtainGeometry(p.z1 - p.z0, height)),
    [panels, height],
  )

  useFrame((_, delta) => {
    const target = device?.open ? 1 : 0
    const k = Math.min(1, delta * 1.8)
    progress.current += (target - progress.current) * k
    panels.forEach((panel, i) => {
      const mesh = meshRefs[i].current
      if (!mesh) return
      const t = progress.current
      const fullWidth = panel.z1 - panel.z0
      const width = fullWidth + (GATHERED_WIDTH - fullWidth) * t
      mesh.scale.x = width / fullWidth
      // outer edge stays put, the fabric gathers there
      mesh.position.z = panel.outer + panel.dir * width / 2
    })
  })

  if (!device) return null

  return (
    <group position={position} rotation={rotation}>
      {/* rod + finials */}
      <mesh position={[ROD_X, 2.64, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.022, 0.022, span, 14]} />
        <meshStandardMaterial color="#8d7a5c" roughness={0.35} metalness={0.75} />
      </mesh>
      {[-half, half].map((z) => (
        <mesh key={z} position={[ROD_X, 2.64, z]} castShadow>
          <sphereGeometry args={[0.042, 16, 12]} />
          <meshStandardMaterial color="#8d7a5c" roughness={0.3} metalness={0.8} />
        </mesh>
      ))}
      {[-(half - 0.3), half - 0.3].map((z) => (
        <mesh key={`br-${z}`} position={[ROD_X, 2.5, z]}>
          <boxGeometry args={[0.03, 0.06, 0.03]} />
          <meshStandardMaterial color="#8d7a5c" roughness={0.4} metalness={0.7} />
        </mesh>
      ))}

      <Clickable id={id} position={[0, 0, 0]} labelOffset={[0.35, 1.7, 0]}>
        {panels.map((panel, i) => (
          <mesh
            key={i}
            ref={meshRefs[i]}
            geometry={geometries[i]}
            position={[FABRIC_X, 1.34, (panel.z0 + panel.z1) / 2]}
            rotation={[0, Math.PI / 2, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              color="#d8c9b2"
              roughness={0.95}
              metalness={0}
              side={THREE.DoubleSide}
              envMapIntensity={0.35}
            />
          </mesh>
        ))}
      </Clickable>
    </group>
  )
}
