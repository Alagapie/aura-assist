import { useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBox } from '@react-three/drei'
import {
  HOUSE_HEIGHT, HOUSE_ENVELOPE, EXTERIOR, ROOF, OPENINGS, OPENING_BY_ID,
} from '../config/house'
import { buildEnvelopeWalls } from './helpers/wallBuild'
import { makeWallGeometry } from './helpers/roomGeometry'
import { createPlasterTexture, createTileTexture } from './helpers/textures'

/**
 * Everything *outside* the rooms.
 *
 * The interior is a doll-house cutaway: the room walls are single sided and face
 * inward, which is what makes the layout legible from the default camera. This
 * module gives the same building an outward-facing surface — the skin, the flat
 * roof and the walled grounds — so orbiting out to the street shows a real
 * house. The skin reuses the room openings, so its windows line up exactly.
 *
 * There is deliberately NO gate in the boundary wall (just an open gap where the
 * path leaves the plot) and NO car.
 */

const {
  x0: EX0, x1: EX1, z0: EZ0, z1: EZ1,
} = HOUSE_ENVELOPE
const EXW = EX1 - EX0
const EXD = EZ1 - EZ0
const EXCX = (EX0 + EX1) / 2
const EXCZ = (EZ0 + EZ1) / 2

const ENVELOPE_RECT = { x0: EX0, x1: EX1, z0: EZ0, z1: EZ1 }

/* ------------------------------------------------------------- materials --- */

function useExteriorMaterials() {
  return useMemo(() => ({
    stucco: new THREE.MeshStandardMaterial({
      map: createPlasterTexture({ repeat: [6, 1.5], color: '#d9cdb8' }),
      roughness: 0.96,
      metalness: 0,
    }),
    stone: new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 0.9, metalness: 0.02 }),
    slab: new THREE.MeshStandardMaterial({ color: '#bdb6a8', roughness: 0.96 }),
    fascia: new THREE.MeshStandardMaterial({ color: '#efe9df', roughness: 0.7 }),
    pavers: new THREE.MeshStandardMaterial({
      map: createTileTexture({ repeat: [10, 8], base: '#b6afa3', grout: '#948d82' }),
      roughness: 0.85,
      metalness: 0.02,
    }),
    lawn: new THREE.MeshStandardMaterial({ color: '#6f8455', roughness: 1 }),
    frontWall: new THREE.MeshStandardMaterial({
      map: createPlasterTexture({ repeat: [9, 0.8], color: '#cdc4b2' }),
      roughness: 0.95,
      metalness: 0,
    }),
    coping: new THREE.MeshStandardMaterial({ color: '#a49c8d', roughness: 0.8 }),
    hedge: new THREE.MeshStandardMaterial({ color: '#3d5a36', roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#4c6d40', roughness: 1 }),
    trunk: new THREE.MeshStandardMaterial({ color: '#5b4632', roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ color: '#9aa1a8', roughness: 0.4, metalness: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ color: '#3a3f44', roughness: 0.6, metalness: 0.4 }),
  }), [])
}

/* ------------------------------------------------------------------ skin --- */

/** The outward-facing wall skin, with the room windows cut through it. */
function Skin({ materials }) {
  const walls = useMemo(
    () => buildEnvelopeWalls(ENVELOPE_RECT, OPENINGS, { offset: EXTERIOR.skinOffset }),
    [],
  )
  const geometries = useMemo(
    () => walls.map((w) => makeWallGeometry(w.width, HOUSE_HEIGHT, w.holes)),
    [walls],
  )
  return (
    <group>
      {walls.map((w, i) => (
        <mesh
          key={`skin-${i}`}
          material={materials.stucco}
          position={[w.center[0], HOUSE_HEIGHT / 2, w.center[1]]}
          rotation={w.rotation}
          castShadow
          receiveShadow
        >
          <primitive object={geometries[i]} attach="geometry" />
        </mesh>
      ))}
    </group>
  )
}

/** A foundation band hugging the base of the skin. */
function Plinth({ materials }) {
  const t = 0.2
  const h = 0.3
  const y = 0.03
  const out = EXTERIOR.skinOffset + t / 2
  const items = [
    { p: [EXCX, y, EZ0 - out], s: [EXW + 2 * out, h, t] },
    { p: [EXCX, y, EZ1 + out], s: [EXW + 2 * out, h, t] },
    { p: [EX0 - out, y, EXCZ], s: [t, h, EXD + 2 * out] },
    { p: [EX1 + out, y, EXCZ], s: [t, h, EXD + 2 * out] },
  ]
  return (
    <group>
      {items.map((it, i) => (
        <mesh key={`plinth-${i}`} material={materials.stone} position={it.p} castShadow receiveShadow>
          <boxGeometry args={it.s} />
        </mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------ roof plant --- */

function Equipment({ item, materials }) {
  const { metal, dark } = materials
  const [x, y, z] = item.position
  switch (item.kind) {
    case 'condenser':
      return (
        <group position={[x, y, z]}>
          <mesh material={metal} position={[0, 0.08, 0]} castShadow>
            <boxGeometry args={[0.92, 0.12, 0.62]} />
          </mesh>
          <mesh material={dark} position={[0, 0.4, 0]} castShadow>
            <boxGeometry args={[0.9, 0.52, 0.6]} />
          </mesh>
          <mesh material={metal} position={[0, 0.4, 0.305]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.21, 20]} />
          </mesh>
          <mesh material={metal} position={[0, 0.4, 0.31]}>
            <torusGeometry args={[0.21, 0.018, 8, 20]} />
          </mesh>
        </group>
      )
    case 'tank':
      return (
        <group position={[x, y, z]}>
          <mesh material={dark} position={[0, 0.14, 0]} castShadow>
            <boxGeometry args={[1.0, 0.28, 0.7]} />
          </mesh>
          <mesh material={metal} position={[0, 0.62, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.38, 0.38, 1.2, 20]} />
          </mesh>
          {[-0.42, 0.42].map((oz) => (
            <mesh key={oz} material={dark} position={[0, 0.62, oz * 0.78]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.38, 0.02, 6, 16]} />
            </mesh>
          ))}
        </group>
      )
    case 'vent':
      return (
        <group position={[x, y, z]}>
          <mesh material={dark} position={[0, 0.35, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.09, 0.7, 12]} />
          </mesh>
          <mesh material={metal} position={[0, 0.74, 0]} castShadow>
            <cylinderGeometry args={[0.14, 0.11, 0.12, 12]} />
          </mesh>
        </group>
      )
    case 'chimney':
      return (
        <group position={[x, y, z]}>
          <mesh material={materials.stone} position={[0, 0.7, 0]} castShadow>
            <boxGeometry args={[0.7, 1.5, 0.7]} />
          </mesh>
          <mesh material={dark} position={[0, 1.5, 0]} castShadow>
            <boxGeometry args={[0.86, 0.12, 0.86]} />
          </mesh>
          <mesh material={dark} position={[0, 1.62, 0]}>
            <boxGeometry args={[0.3, 0.14, 0.3]} />
          </mesh>
        </group>
      )
    case 'aerial':
      return (
        <group position={[x, y, z]}>
          <mesh material={metal} position={[0, 0.7, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.045, 1.4, 8]} />
          </mesh>
          {[0.9, 1.05, 1.2, 1.35].map((h, i) => (
            <mesh key={h} material={metal} position={[0, h, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.012, 0.012, 0.7 - i * 0.12, 6]} />
            </mesh>
          ))}
        </group>
      )
    default:
      return null
  }
}

/** Flat roof: a parapet ring, an eaves band and rooftop plant. */
function Roof({ materials }) {
  const { parapet, eave, equipment } = ROOF
  const ph = parapet.height
  const pt = parapet.thickness
  const py = HOUSE_HEIGHT + ph / 2
  const ev = eave.overhang
  const et = eave.thickness

  const ring = (size, y, thickness, outset) => ([
    { p: [EXCX, y, EZ0 - outset], s: [EXW + 2 * outset, size, thickness] },
    { p: [EXCX, y, EZ1 + outset], s: [EXW + 2 * outset, size, thickness] },
    { p: [EX0 - outset, y, EXCZ], s: [thickness, size, EXD + 2 * outset] },
    { p: [EX1 + outset, y, EXCZ], s: [thickness, size, EXD + 2 * outset] },
  ])

  const parapets = ring(ph, py, pt, pt / 2)
  const eaves = ring(et, eave.y, et, ev / 2)

  return (
    <group>
      {eaves.map((it, i) => (
        <mesh key={`eave-${i}`} material={materials.fascia} position={it.p} castShadow receiveShadow>
          <boxGeometry args={it.s} />
        </mesh>
      ))}
      {parapets.map((it, i) => (
        <mesh key={`parapet-${i}`} material={materials.slab} position={it.p} castShadow receiveShadow>
          <boxGeometry args={it.s} />
        </mesh>
      ))}
      {equipment.map((item) => (
        <Equipment key={item.id} item={item} materials={materials} />
      ))}
    </group>
  )
}

/* ------------------------------------------------------------- compound ---- */

function Tree({ position, scale = 1, materials }) {
  return (
    <group position={position} scale={scale}>
      <mesh material={materials.trunk} position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.17, 1.8, 10]} />
      </mesh>
      <mesh material={materials.leaf} position={[0, 2.1, 0]} castShadow>
        <sphereGeometry args={[0.95, 14, 12]} />
      </mesh>
      <mesh material={materials.leaf} position={[0.5, 1.7, 0.2]} castShadow>
        <sphereGeometry args={[0.6, 12, 10]} />
      </mesh>
      <mesh material={materials.leaf} position={[-0.42, 1.85, -0.28]} castShadow>
        <sphereGeometry args={[0.66, 12, 10]} />
      </mesh>
    </group>
  )
}

function Hedge({ position, size, materials, rotation = [0, 0, 0] }) {
  return (
    <RoundedBox args={size} radius={0.14} smoothness={2} position={position} rotation={rotation}
      material={materials.hedge} castShadow receiveShadow />
  )
}

/** The grounds: lawn, terrace, path, boundary wall (no gate) and planting. */
function Compound({ materials }) {
  const { plot, boundary, opening, terrace, path } = EXTERIOR.compound
  const bh = boundary.height
  const bt = boundary.thickness
  const coping = boundary.coping

  const gapLo = opening.along - opening.width / 2
  const gapHi = opening.along + opening.width / 2

  // boundary segments: [axis, line, from, to]
  const segments = [
    ['x', plot.z0, plot.x0, plot.x1],
    ['z', plot.x0, plot.z0, plot.z1],
    ['z', plot.x1, plot.z0, plot.z1],
    ['x', plot.z1, plot.x0, gapLo],
    ['x', plot.z1, gapHi, plot.x1],
  ]

  const mainDoor = OPENING_BY_ID.mainDoor
  const porchZ = mainDoor.line + 0.8
  const postH = mainDoor.y1 + 0.24
  const canopyY = postH + 0.06

  const plane = (r, y) => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: [(r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2],
    args: [r.x1 - r.x0, r.z1 - r.z0],
  })
  const lawnP = plane(plot, -0.004)
  const terraceP = plane(terrace, 0.03)
  const pathP = plane(path, 0.03)

  return (
    <group>
      {/* lawn over the whole plot */}
      <mesh material={materials.lawn} rotation={lawnP.rotation} position={lawnP.position} receiveShadow>
        <planeGeometry args={lawnP.args} />
      </mesh>

      {/* terrace + path */}
      <mesh material={materials.pavers} rotation={terraceP.rotation} position={terraceP.position} receiveShadow>
        <planeGeometry args={terraceP.args} />
      </mesh>
      <mesh material={materials.pavers} rotation={pathP.rotation} position={pathP.position} receiveShadow>
        <planeGeometry args={pathP.args} />
      </mesh>
      {/* terrace curb */}
      {[
        { p: [(terrace.x0 + terrace.x1) / 2, 0.06, terrace.z1], s: [terrace.x1 - terrace.x0, 0.14, 0.1] },
        { p: [terrace.x0, 0.06, (terrace.z0 + terrace.z1) / 2], s: [0.1, 0.14, terrace.z1 - terrace.z0] },
        { p: [terrace.x1, 0.06, (terrace.z0 + terrace.z1) / 2], s: [0.1, 0.14, terrace.z1 - terrace.z0] },
      ].map((c, i) => (
        <mesh key={`curb-${i}`} material={materials.coping} position={c.p} castShadow receiveShadow>
          <boxGeometry args={c.s} />
        </mesh>
      ))}

      {/* boundary wall with a plain, gateless opening */}
      {segments.map(([axis, line, from, to], i) => {
        const len = to - from
        const mid = (from + to) / 2
        const size = axis === 'x' ? [len, bh, bt] : [bt, bh, len]
        const pos = axis === 'x' ? [mid, bh / 2, line] : [line, bh / 2, mid]
        const cSize = axis === 'x' ? [len + 0.06, coping, bt + 0.08] : [bt + 0.08, coping, len + 0.06]
        const cPos = axis === 'x' ? [mid, bh + coping / 2, line] : [line, bh + coping / 2, mid]
        return (
          <group key={`bw-${i}`}>
            <mesh material={materials.frontWall} position={pos} castShadow receiveShadow>
              <boxGeometry args={size} />
            </mesh>
            <mesh material={materials.coping} position={cPos} castShadow receiveShadow>
              <boxGeometry args={cSize} />
            </mesh>
          </group>
        )
      })}

      {/* entrance canopy over the front door */}
      <group>
        <mesh material={materials.fascia} position={[mainDoor.along, canopyY, porchZ]} castShadow receiveShadow>
          <boxGeometry args={[mainDoor.width + 1.2, 0.12, 1.5]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh
            key={`post-${s}`}
            material={materials.trunk}
            position={[mainDoor.along + s * (mainDoor.width / 2 + 0.4), postH / 2, porchZ + 0.6]}
            castShadow
          >
            <cylinderGeometry args={[0.07, 0.08, postH, 12]} />
          </mesh>
        ))}
      </group>

      {/* planting: hedges flanking the path and bedding the front corners */}
      <Hedge materials={materials} position={[0.95, 0.35, 10.6]} size={[0.55, 0.7, 2.6]} />
      <Hedge materials={materials} position={[4.25, 0.35, 10.6]} size={[0.55, 0.7, 2.6]} />
      <Hedge materials={materials} position={[-3.6, 0.35, 8.0]} size={[3.4, 0.7, 0.7]} />
      <Hedge materials={materials} position={[9.2, 0.35, 8.0]} size={[3.4, 0.7, 0.7]} />
      <Hedge materials={materials} position={[-6.0, 0.4, 4.0]} size={[0.8, 0.8, 4.0]} />
      <Hedge materials={materials} position={[11.0, 0.4, 2.0]} size={[0.8, 0.8, 5.0]} />

      <Tree materials={materials} position={[-6.6, 0, 9.6]} scale={1.15} />
      <Tree materials={materials} position={[11.4, 0, 9.2]} scale={1.05} />
      <Tree materials={materials} position={[-6.8, 0, -11.2]} scale={1.1} />
      <Tree materials={materials} position={[11.6, 0, -10.8]} scale={1.0} />
    </group>
  )
}

/** Scene-level exterior: skin, roof and grounds. */
export function Exterior() {
  const materials = useExteriorMaterials()
  return (
    <group>
      <Skin materials={materials} />
      <Plinth materials={materials} />
      <Roof materials={materials} />
      <Compound materials={materials} />
    </group>
  )
}
