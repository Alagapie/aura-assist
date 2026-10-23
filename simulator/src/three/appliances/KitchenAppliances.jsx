import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { Clickable } from '../helpers/Clickable'
import { useDevice } from '../../store/useRoomStore'

/** A single lined compartment: back / sides / top / bottom panels, front open. */
function Cavity({ y, height, depth = 0.56, z = -0.01, liner = '#eef1f3' }) {
  const halfD = depth / 2
  const panel = (args, pos, color = liner, rough = 0.72) => (
    <mesh position={pos}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={rough} />
    </mesh>
  )
  return (
    <group position={[0, y, z]}>
      {panel([0.68, height, 0.02], [0, 0, -halfD], liner)}            {/* back */}
      {panel([0.02, height, depth], [-0.34, 0, 0], '#e6eaed')}         {/* left */}
      {panel([0.02, height, depth], [0.34, 0, 0], '#e6eaed')}          {/* right */}
      {panel([0.68, 0.02, depth], [0, height / 2, 0], '#e6eaed')}      {/* top */}
      {panel([0.68, 0.02, depth], [0, -height / 2, 0], '#e6eaed')}     {/* bottom */}
    </group>
  )
}

/** A glass shelf with a visible front rail, so the interior reads as shelving. */
function Shelf({ y, w = 0.64, d = 0.5, z = -0.01 }) {
  return (
    <group position={[0, y, z]}>
      <mesh>
        <boxGeometry args={[w, 0.012, d]} />
        <meshPhysicalMaterial color="#e9f3f7" transparent opacity={0.42} roughness={0.06} metalness={0} />
      </mesh>
      {/* front rail so the shelf edge reads even when the glass is near invisible */}
      <mesh position={[0, 0.003, d / 2 + 0.007]}>
        <boxGeometry args={[w, 0.026, 0.017]} />
        <meshStandardMaterial color="#c2cbd1" roughness={0.35} metalness={0.4} />
      </mesh>
    </group>
  )
}

/** Small stock props so the fridge/freezer interior reads as really stocked. */
function Bottle({ position, color = '#bfe3f2', cap = '#2f6f9e', label = null, h = 0.2, r = 0.032 }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[r, r, h, 14]} />
        <meshStandardMaterial color={color} roughness={0.22} metalness={0.05} />
      </mesh>
      {label && (
        <mesh position={[0, -h * 0.05, 0]}>
          <cylinderGeometry args={[r * 1.03, r * 1.03, h * 0.42, 14]} />
          <meshStandardMaterial color={label} roughness={0.5} />
        </mesh>
      )}
      <mesh position={[0, h / 2 + 0.018, 0]}>
        <cylinderGeometry args={[r * 0.55, r * 0.72, 0.038, 12]} />
        <meshStandardMaterial color={cap} roughness={0.4} />
      </mesh>
    </group>
  )
}

function Can({ position, color = '#c0392b', h = 0.115, r = 0.032 }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[r, r, h, 16]} />
        <meshStandardMaterial color={color} roughness={0.26} metalness={0.5} />
      </mesh>
      <mesh position={[0, h / 2 + 0.004, 0]}>
        <cylinderGeometry args={[r * 0.92, r * 0.92, 0.008, 16]} />
        <meshStandardMaterial color="#c9ced4" roughness={0.3} metalness={0.7} />
      </mesh>
    </group>
  )
}

/** Block carton (milk / juice) with a folded gable top and a screw cap. */
function Carton({ position, color = '#f4f7f9', w = 0.08, h = 0.17, d = 0.08 }) {
  const top = h * 0.2
  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      <mesh position={[0, h / 2 + top / 2, 0]} castShadow>
        <boxGeometry args={[w * 0.68, top, d]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      <mesh position={[w * 0.22, h / 2 + top, d * 0.24]}>
        <cylinderGeometry args={[0.016, 0.016, 0.014, 10]} />
        <meshStandardMaterial color="#2f6f9e" roughness={0.4} />
      </mesh>
    </group>
  )
}

/**
 * Fridge-freezer. The upper (fridge) and lower (freezer) doors are independent:
 * clicking the body toggles both together, while the contextual panel can open
 * or close either door on its own. Each compartment has its own interior light
 * that comes on while that door is open and the unit is powered. Both
 * compartments are stocked with everyday drinks and food (milk, juice, water,
 * cans, eggs, fruit, butter and yoghurt up top; ice cream, frozen veg, fish, an
 * ice tray and a pizza below) so the interior reads as a real fridge-freezer
 * when the doors swing open.
 */
export function Refrigerator({ position = [8.55, 0, -2.1], rotation = [0, -Math.PI / 2, 0] }) {
  const device = useDevice('fridge')
  const doorRef = useRef()
  const freezerRef = useRef()
  const lightRef = useRef()
  const freezerLightRef = useRef()
  const fridgeGlowRef = useRef()
  const freezerGlowRef = useRef()

  useFrame((_, delta) => {
    const k = Math.min(1, delta * 5)
    if (doorRef.current) {
      const target = device?.open ? -1.5 : 0
      doorRef.current.rotation.y += (target - doorRef.current.rotation.y) * k
    }
    if (freezerRef.current) {
      const target = device?.freezerOpen ? -1.5 : 0
      freezerRef.current.rotation.y += (target - freezerRef.current.rotation.y) * k
    }
    const fridgeOn = device?.open && device?.power
    const freezerOn = device?.freezerOpen && device?.power
    if (lightRef.current) {
      lightRef.current.intensity += ((fridgeOn ? 5.4 : 0.02) - lightRef.current.intensity) * k
    }
    if (freezerLightRef.current) {
      freezerLightRef.current.intensity += ((freezerOn ? 4 : 0.02) - freezerLightRef.current.intensity) * k
    }
    if (fridgeGlowRef.current) {
      fridgeGlowRef.current.emissiveIntensity += ((fridgeOn ? 1.6 : 0) - fridgeGlowRef.current.emissiveIntensity) * k
    }
    if (freezerGlowRef.current) {
      freezerGlowRef.current.emissiveIntensity += ((freezerOn ? 1.4 : 0) - freezerGlowRef.current.emissiveIntensity) * k
    }
  })

  if (!device) return null

  return (
    <Clickable id="fridge" position={position} rotation={rotation} labelOffset={[0, 2.1, 0.25]} childrenHighlight={false}>
      {/* carcass — brushed stainless */}
      <RoundedBox args={[0.78, 1.98, 0.72]} radius={0.03} smoothness={3} position={[0, 0.99, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#ccd4da" roughness={0.42} metalness={0.3} />
      </RoundedBox>
      {/* dark reveal behind the doors (also reads as the seam between them) */}
      <mesh position={[0, 1.0, 0.34]}>
        <boxGeometry args={[0.73, 1.9, 0.012]} />
        <meshStandardMaterial color="#161a20" roughness={0.9} />
      </mesh>

      {/* ---- upper fridge compartment (y 1.0 .. 1.95) -------------------- */}
      <Cavity y={1.475} height={0.95} liner="#f0f5f8" />
      <Shelf y={1.18} />
      <Shelf y={1.46} />
      <Shelf y={1.74} />
      {/* interior light strip, glows while the door is open */}
      <mesh position={[0, 1.93, 0.16]}>
        <boxGeometry args={[0.6, 0.022, 0.06]} />
        <meshStandardMaterial ref={fridgeGlowRef} color="#fff6e2" emissive="#fff0d0" emissiveIntensity={0} toneMapped={false} />
      </mesh>
      {/* crisper drawer (translucent, with fruit visible inside) */}
      <mesh position={[0, 1.075, 0.04]}>
        <boxGeometry args={[0.66, 0.15, 0.46]} />
        <meshPhysicalMaterial color="#dfeef4" transparent opacity={0.5} roughness={0.14} />
      </mesh>
      <mesh position={[0, 1.15, 0.255]}>
        <boxGeometry args={[0.66, 0.02, 0.02]} />
        <meshStandardMaterial color="#b7c3ca" roughness={0.4} metalness={0.3} />
      </mesh>
      {[['#c0392b', -0.17], ['#3f8f3f', -0.07], ['#e08a2b', 0.02], ['#c0392b', 0.12]].map(([c, x], i) => (
        <mesh key={`fruit${i}`} position={[x, 1.09, i % 2 ? -0.03 : 0.05]} castShadow>
          <sphereGeometry args={[0.04, 12, 10]} />
          <meshStandardMaterial color={c} roughness={0.45} />
        </mesh>
      ))}
      {/* shelf 1: milk + juice cartons, water bottles */}
      <Carton position={[-0.23, 1.278, 0.02]} color="#f6f9fb" w={0.085} h={0.17} d={0.085} />
      <Carton position={[-0.08, 1.27, -0.04]} color="#f0a52e" w={0.078} h={0.155} d={0.078} />
      <Bottle position={[0.09, 1.292, 0.03]} color="#cdeaf7" cap="#2f6f9e" label="#2f6f9e" h={0.2} />
      <Bottle position={[0.2, 1.292, -0.02]} color="#cdeaf7" cap="#2f6f9e" label="#2f6f9e" h={0.2} />
      {/* shelf 2: cans, a juice bottle and butter */}
      <Can position={[0.05, 1.528, 0.05]} color="#c0392b" />
      <Can position={[0.15, 1.528, 0.05]} color="#2f7d4f" />
      <Can position={[0.1, 1.528, -0.06]} color="#e0a12b" />
      <Bottle position={[-0.2, 1.562, 0.02]} color="#bfe3f2" cap="#3f8f3f" label="#3f8f3f" h={0.185} />
      <mesh position={[-0.02, 1.493, 0.02]} castShadow>
        <boxGeometry args={[0.17, 0.05, 0.11]} />
        <meshStandardMaterial color="#f2d98a" roughness={0.6} />
      </mesh>
      {/* shelf 3: cheese, yoghurts, egg tray */}
      <mesh position={[-0.23, 1.783, 0.0]} castShadow>
        <boxGeometry args={[0.12, 0.07, 0.12]} />
        <meshStandardMaterial color="#f6e7a8" roughness={0.5} />
      </mesh>
      {[0.06, 0.15].map((x, i) => (
        <mesh key={`yg${i}`} position={[x, 1.79, i ? -0.04 : 0.05]} castShadow>
          <cylinderGeometry args={[0.036, 0.03, 0.078, 14]} />
          <meshStandardMaterial color={i ? '#e88bb0' : '#f3f0e6'} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[-0.06, 1.768, -0.05]}>
        <boxGeometry args={[0.2, 0.024, 0.12]} />
        <meshStandardMaterial color="#e9e2d4" roughness={0.6} />
      </mesh>
      {[-0.13, -0.06, 0.01].map((x, i) => (
        <mesh key={`egg${i}`} position={[x, 1.796, -0.05]} castShadow>
          <sphereGeometry args={[0.022, 10, 8]} />
          <meshStandardMaterial color="#f2e6c8" roughness={0.55} />
        </mesh>
      ))}
      <pointLight ref={lightRef} position={[0, 1.9, 0.1]} intensity={0} distance={2.6} color="#fff3da" />

      {/* ---- lower freezer compartment (y 0.05 .. 0.94) ------------------ */}
      <Cavity y={0.49} height={0.86} liner="#eef5f9" />
      <Shelf y={0.42} />
      {/* interior light strip, glows while the door is open */}
      <mesh position={[0, 0.9, 0.16]}>
        <boxGeometry args={[0.6, 0.022, 0.06]} />
        <meshStandardMaterial ref={freezerGlowRef} color="#eaf6ff" emissive="#dff0ff" emissiveIntensity={0} toneMapped={false} />
      </mesh>
      {/* wire basket up top */}
      <mesh position={[0, 0.72, 0.01]}>
        <boxGeometry args={[0.64, 0.02, 0.48]} />
        <meshStandardMaterial color="#c6ced3" roughness={0.4} metalness={0.25} />
      </mesh>
      {/* ice-cube tray */}
      <mesh position={[-0.22, 0.775, 0.03]} castShadow>
        <boxGeometry args={[0.18, 0.06, 0.13]} />
        <meshStandardMaterial color="#dbeef6" roughness={0.35} />
      </mesh>
      {/* frozen veg bag */}
      <mesh position={[0.12, 0.79, -0.02]} castShadow>
        <boxGeometry args={[0.17, 0.1, 0.09]} />
        <meshStandardMaterial color="#5fae4a" roughness={0.55} />
      </mesh>
      {/* tub of ice cream on the shelf */}
      <mesh position={[-0.19, 0.5, 0.04]} castShadow>
        <cylinderGeometry args={[0.085, 0.075, 0.14, 18]} />
        <meshStandardMaterial color="#f2b8cf" roughness={0.45} />
      </mesh>
      <mesh position={[-0.19, 0.575, 0.04]}>
        <cylinderGeometry args={[0.088, 0.088, 0.02, 18]} />
        <meshStandardMaterial color="#e07fa8" roughness={0.4} />
      </mesh>
      {/* frozen fish + meat packs */}
      <mesh position={[0.02, 0.48, -0.03]} castShadow>
        <boxGeometry args={[0.17, 0.1, 0.13]} />
        <meshStandardMaterial color="#8fb7cf" roughness={0.5} />
      </mesh>
      <mesh position={[0.18, 0.475, 0.03]} castShadow>
        <boxGeometry args={[0.16, 0.09, 0.13]} />
        <meshStandardMaterial color="#c98b8b" roughness={0.55} />
      </mesh>
      {/* frozen pizza box flat on the floor */}
      <mesh position={[0, 0.105, 0.0]} castShadow>
        <boxGeometry args={[0.36, 0.05, 0.3]} />
        <meshStandardMaterial color="#e6c98a" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.135, 0.0]}>
        <boxGeometry args={[0.3, 0.012, 0.24]} />
        <meshStandardMaterial color="#c0392b" roughness={0.6} />
      </mesh>
      <pointLight ref={freezerLightRef} position={[0, 0.86, 0.1]} intensity={0} distance={2.1} color="#eaf6ff" />

      {/* ---- upper (fridge) door ---------------------------------------- */}
      <group ref={doorRef} position={[-0.37, 0, 0.375]}>
        <mesh position={[0.37, 1.475, 0.026]} castShadow>
          <boxGeometry args={[0.745, 0.96, 0.052]} />
          <meshStandardMaterial color="#dde4e9" roughness={0.3} metalness={0.26} />
        </mesh>
        {/* door gasket */}
        <mesh position={[0.37, 1.475, -0.002]}>
          <boxGeometry args={[0.7, 0.9, 0.014]} />
          <meshStandardMaterial color="#8f979e" roughness={0.85} />
        </mesh>
        {/* temperature readout */}
        <mesh position={[0.37, 1.85, 0.056]}>
          <boxGeometry args={[0.26, 0.1, 0.012]} />
          <meshStandardMaterial color="#14181d" roughness={0.3} metalness={0.2} />
        </mesh>
        <mesh position={[0.37, 1.85, 0.064]}>
          <boxGeometry args={[0.14, 0.032, 0.006]} />
          <meshStandardMaterial
            color="#06222b"
            emissive={device.power ? '#6fe3ff' : '#0a1418'}
            emissiveIntensity={device.power ? 1.9 : 0}
            toneMapped={false}
          />
        </mesh>
        {/* vertical bar handle */}
        <mesh position={[0.66, 1.4, 0.086]} castShadow>
          <boxGeometry args={[0.03, 0.72, 0.03]} />
          <meshStandardMaterial color="#eef3f6" roughness={0.26} metalness={0.5} />
        </mesh>
        {[1.73, 1.07].map((y, i) => (
          <mesh key={`hb${i}`} position={[0.66, y, 0.05]}>
            <boxGeometry args={[0.03, 0.034, 0.11]} />
            <meshStandardMaterial color="#eef3f6" roughness={0.26} metalness={0.5} />
          </mesh>
        ))}
        {/* door shelves with drinks */}
        <mesh position={[0.37, 1.15, -0.03]}>
          <boxGeometry args={[0.64, 0.02, 0.11]} />
          <meshStandardMaterial color="#dde5ea" roughness={0.5} />
        </mesh>
        <mesh position={[0.37, 1.21, 0.028]}>
          <boxGeometry args={[0.64, 0.1, 0.012]} />
          <meshPhysicalMaterial color="#e8f1f5" transparent opacity={0.4} roughness={0.1} />
        </mesh>
        <Bottle position={[0.19, 1.26, -0.05]} color="#cdeaf7" cap="#2f6f9e" label="#2f6f9e" h={0.2} />
        <Can position={[0.46, 1.248, -0.05]} color="#c0392b" />
        <Can position={[0.55, 1.248, -0.05]} color="#e0a12b" />
        <mesh position={[0.37, 1.49, -0.03]}>
          <boxGeometry args={[0.64, 0.02, 0.11]} />
          <meshStandardMaterial color="#dde5ea" roughness={0.5} />
        </mesh>
        <mesh position={[0.37, 1.55, 0.028]}>
          <boxGeometry args={[0.64, 0.1, 0.012]} />
          <meshPhysicalMaterial color="#e8f1f5" transparent opacity={0.4} roughness={0.1} />
        </mesh>
        <Bottle position={[0.28, 1.6, -0.05]} color="#cdeaf7" cap="#3f8f3f" label="#3f8f3f" h={0.185} />
        <Bottle position={[0.48, 1.59, -0.05]} color="#f0c14b" cap="#a8621f" label="#a8621f" h={0.16} />
      </group>

      {/* ---- lower (freezer) door --------------------------------------- */}
      <group ref={freezerRef} position={[-0.37, 0, 0.375]}>
        <mesh position={[0.37, 0.49, 0.026]} castShadow>
          <boxGeometry args={[0.745, 0.9, 0.052]} />
          <meshStandardMaterial color="#dde4e9" roughness={0.3} metalness={0.26} />
        </mesh>
        {/* door gasket */}
        <mesh position={[0.37, 0.52, -0.002]}>
          <boxGeometry args={[0.7, 0.82, 0.014]} />
          <meshStandardMaterial color="#8f979e" roughness={0.85} />
        </mesh>
        {/* horizontal freezer handle */}
        <mesh position={[0.37, 0.86, 0.086]} castShadow>
          <boxGeometry args={[0.52, 0.03, 0.03]} />
          <meshStandardMaterial color="#eef3f6" roughness={0.26} metalness={0.5} />
        </mesh>
        {[0.13, 0.61].map((x, i) => (
          <mesh key={`fb${i}`} position={[x, 0.86, 0.05]}>
            <boxGeometry args={[0.03, 0.034, 0.11]} />
            <meshStandardMaterial color="#eef3f6" roughness={0.26} metalness={0.5} />
          </mesh>
        ))}
        {/* power LED */}
        <mesh position={[0.37, 0.16, 0.056]}>
          <boxGeometry args={[0.14, 0.018, 0.006]} />
          <meshStandardMaterial
            color="#0d2a1c"
            emissive={device.power ? '#7dffbf' : '#000000'}
            emissiveIntensity={device.power ? 1.6 : 0}
            toneMapped={false}
          />
        </mesh>
        {/* freezer door bin */}
        <mesh position={[0.37, 0.5, -0.03]}>
          <boxGeometry args={[0.64, 0.02, 0.1]} />
          <meshStandardMaterial color="#dbe4ea" roughness={0.5} />
        </mesh>
        <mesh position={[0.26, 0.58, -0.045]} castShadow>
          <boxGeometry args={[0.14, 0.13, 0.06]} />
          <meshStandardMaterial color="#e6c98a" roughness={0.6} />
        </mesh>
      </group>
      {/* feet */}
      {[[-0.3, 0.3], [0.3, 0.3], [-0.3, -0.3], [0.3, -0.3]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.02, z]}>
          <cylinderGeometry args={[0.03, 0.035, 0.04, 10]} />
          <meshStandardMaterial color="#2a2e33" roughness={0.6} />
        </mesh>
      ))}
    </Clickable>
  )
}

/**
 * Freestanding cooker: glowing hob rings driven by `heat`, an oven cavity that
 * lights up when `ovenOn`, and a glass door. Click toggles the whole unit.
 */
export function Cooker({ position = [4.7, 0, -2.45], rotation = [0, 0, 0] }) {
  const device = useDevice('cooker')
  const glowRefs = [useRef(), useRef(), useRef(), useRef()]

  const heat = device?.heat ?? 0
  const on = device?.power && heat > 0

  useFrame((state) => {
    const pulse = on ? 1.5 + Math.sin(state.clock.elapsedTime * 3) * 0.4 : 0
    glowRefs.forEach((ref, i) => {
      if (!ref.current) return
      // front-left and rear-right rings share the hob level
      const active = i % 2 === 0 ? heat : Math.max(0, heat - 1)
      ref.current.emissiveIntensity = active > 0 ? pulse * (active / 3) : 0
    })
  })

  if (!device) return null

  const ringPos = [
    [-0.2, -0.16], [0.2, -0.16], [-0.2, 0.16], [0.2, 0.16],
  ]

  return (
    <Clickable id="cooker" position={position} rotation={rotation} labelOffset={[0, 1.6, 0.3]} childrenHighlight={false}>
      {/* body */}
      <RoundedBox args={[0.6, 0.9, 0.62]} radius={0.02} smoothness={3} position={[0, 0.47, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#d7dade" roughness={0.4} metalness={0.45} />
      </RoundedBox>
      {/* hob surface */}
      <mesh position={[0, 0.93, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.56, 0.58]} />
        <meshStandardMaterial color="#1c1f23" roughness={0.25} metalness={0.6} />
      </mesh>
      {/* burner rings */}
      {ringPos.map(([x, z], i) => (
        <group key={i} position={[x, 0.937, z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.06, 0.095, 24]} />
            <meshStandardMaterial
              ref={glowRefs[i]}
              color="#2b2f34"
              emissive="#ff5a1f"
              emissiveIntensity={0}
              toneMapped={false}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
            <circleGeometry args={[0.058, 20]} />
            <meshStandardMaterial color="#14171a" roughness={0.4} metalness={0.5} />
          </mesh>
        </group>
      ))}
      {/* control knobs */}
      {[-0.18, -0.06, 0.06, 0.18].map((x) => (
        <mesh key={x} position={[x, 0.84, 0.32]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.03, 14]} />
          <meshStandardMaterial color="#31363c" roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
      {/* oven door with window */}
      <mesh position={[0, 0.42, 0.315]} castShadow>
        <boxGeometry args={[0.54, 0.62, 0.03]} />
        <meshStandardMaterial color="#c6cacd" roughness={0.35} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.44, 0.333]}>
        <planeGeometry args={[0.4, 0.4]} />
        <meshStandardMaterial
          color={device.ovenOn ? '#4a1c08' : '#101215'}
          emissive={device.ovenOn ? '#ff7a2a' : '#000000'}
          emissiveIntensity={device.ovenOn ? 1.1 : 0}
          roughness={0.2}
          metalness={0.3}
          toneMapped={false}
        />
      </mesh>
      {/* oven handle */}
      <mesh position={[0, 0.7, 0.35]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.015, 0.015, 0.46, 12]} />
        <meshStandardMaterial color="#2e3237" roughness={0.3} metalness={0.8} />
      </mesh>
    </Clickable>
  )
}

/**
 * Wall mounted range hood over the hob. The fan spinner follows the device
 * speed and the downlights wash the counter when the hood light would run
 * (light is bundled into the hood's power for simplicity).
 */
export function RangeHood({ position = [4.7, 2.05, -2.6], rotation = [0, 0, 0] }) {
  const device = useDevice('rangeHood')
  const spinRef = useRef()

  useFrame((_, delta) => {
    if (!spinRef.current) return
    const target = device?.power ? 4 + (device?.speed ?? 1) * 4 : 0
    const current = spinRef.current.userData.speed ?? 0
    const next = current + (target - current) * Math.min(1, delta * 2)
    spinRef.current.userData.speed = next
    spinRef.current.rotation.y += next * delta
  })

  if (!device) return null

  return (
    <Clickable id="rangeHood" position={position} rotation={rotation} labelOffset={[0, 0.55, 0.3]} childrenHighlight={false}>
      {/* chimney */}
      <mesh position={[0, 0.45, -0.1]} castShadow>
        <boxGeometry args={[0.28, 0.9, 0.26]} />
        <meshStandardMaterial color="#c9ced3" roughness={0.35} metalness={0.6} />
      </mesh>
      {/* canopy */}
      <RoundedBox args={[0.66, 0.16, 0.5]} radius={0.02} smoothness={3} position={[0, 0, 0]} castShadow>
        <meshStandardMaterial color="#d4d9dd" roughness={0.32} metalness={0.65} />
      </RoundedBox>
      {/* underside + filter */}
      <mesh position={[0, -0.081, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.56, 0.42]} />
        <meshStandardMaterial color="#26292d" roughness={0.85} />
      </mesh>
      {/* fan spinner */}
      <group ref={spinRef} position={[0, -0.086, 0]} rotation={[Math.PI / 2, 0, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]} position={[0, 0, 0]}>
            <boxGeometry args={[0.2, 0.01, 0.05]} />
            <meshStandardMaterial
              color={device.power ? '#8f979f' : '#3c4046'}
              metalness={0.7}
              roughness={0.35}
            />
          </mesh>
        ))}
      </group>
      {/* task lights */}
      {[-0.2, 0.2].map((x) => (
        <mesh key={x} position={[x, -0.083, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.045, 16]} />
          <meshStandardMaterial
            color="#fff6e6"
            emissive="#ffe9c4"
            emissiveIntensity={device.power ? 2 : 0.05}
            toneMapped={false}
          />
        </mesh>
      ))}
      <pointLight position={[0, -0.3, 0.2]} intensity={device.power ? 3 : 0} distance={2.6} color="#ffe9c4" />
      {/* buttons */}
      {[-0.1, 0, 0.1].map((x) => (
        <mesh key={x} position={[x, 0.02, 0.251]}>
          <boxGeometry args={[0.06, 0.04, 0.01]} />
          <meshStandardMaterial color="#2b2f34" roughness={0.5} metalness={0.4} />
        </mesh>
      ))}
    </Clickable>
  )
}
