import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Clickable } from '../helpers/Clickable'
import { createGlowTexture } from '../helpers/glow'
import { useDevice } from '../../store/useRoomStore'

const glowTexture = typeof window !== 'undefined' ? createGlowTexture() : null

/**
 * Smoothly drives a light source and its emissive shade towards the device
 * state, so switching a lamp on/off or dragging the brightness slider animates
 * instead of snapping.
 *
 * The returned refs go on the light source, the shade material and the optional
 * additive glow material respectively.
 */
function useLightTransition(device, baseIntensity) {
  const lightRef = useRef()
  const shadeRef = useRef()
  const glowRef = useRef()

  const targetIntensity = device.power ? baseIntensity * device.brightness : 0
  const targetEmissive = device.power ? 0.12 + device.brightness * 1.25 : 0.015
  const color = useMemo(() => new THREE.Color(device.color), [device.color])

  useFrame((_, delta) => {
    const k = Math.min(1, delta * 6)
    const light = lightRef.current
    if (light) {
      light.intensity += (targetIntensity - light.intensity) * k
      light.color.lerp(color, k)
    }
    const shade = shadeRef.current
    if (shade) {
      shade.emissiveIntensity += (targetEmissive - shade.emissiveIntensity) * k
      shade.emissive.lerp(color, k)
    }
    const glow = glowRef.current
    if (glow) {
      glow.opacity += ((device.power ? 0.12 + device.brightness * 0.38 : 0) - glow.opacity) * k
      glow.color.lerp(color, k)
    }
  })

  return { lightRef, shadeRef, glowRef }
}

/* ------------------------------------------------------------------ ceiling */

export function CeilingLight({ id, position = [0, 0, 0], withShadow = false }) {
  const device = useDevice(id)
  const { lightRef, shadeRef, glowRef } = useLightTransition(device, 30)

  // A spotlight needs an explicit target object inside the scene graph.
  useEffect(() => {
    const light = lightRef.current
    if (!light || !light.parent) return undefined
    const target = new THREE.Object3D()
    target.position.set(0, 0, 0)
    light.parent.add(target) // local space: straight below the fixture
    light.target = target
    return () => {
      light.parent?.remove(target)
    }
  }, [lightRef])

  if (!device) return null

  return (
    <Clickable id={id} position={position} labelOffset={[0, 0.45, 0]} childrenHighlight={false}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.26, 0.28, 0.06, 28]} />
        <meshStandardMaterial color="#f2f0ec" roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh position={[0, -0.005, 0]}>
        <cylinderGeometry args={[0.23, 0.23, 0.035, 28]} />
        <meshStandardMaterial ref={shadeRef} color="#fff6e6" emissive={device.color} emissiveIntensity={0.4} roughness={0.65} />
      </mesh>
      <mesh position={[0, -0.022, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.235, 0.012, 8, 32]} />
        <meshStandardMaterial color="#d8d3cb" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, -0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.8, 2.8]} />
        <meshBasicMaterial
          ref={glowRef}
          map={glowTexture}
          transparent
          opacity={0.18}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          color={device.color}
        />
      </mesh>
      <spotLight
        ref={lightRef}
        position={[0, -0.08, 0]}
        castShadow={withShadow}
        angle={1.15}
        penumbra={0.85}
        decay={1.6}
        distance={11}
        intensity={0}
        color={device.color}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0008}
        shadow-normalBias={0.02}
      />
    </Clickable>
  )
}

/* --------------------------------------------------------------- wall light */

export function WallSconce({ id, position = [0, 0, 0], rotation = [0, 0, 0] }) {
  const device = useDevice(id)
  const { lightRef, shadeRef, glowRef } = useLightTransition(device, 7)
  if (!device) return null

  return (
    <Clickable id={id} position={position} rotation={rotation} labelOffset={[0, 0.35, 0.2]} childrenHighlight={false}>
      <mesh>
        <boxGeometry args={[0.13, 0.26, 0.03]} />
        <meshStandardMaterial color="#cbb277" roughness={0.35} metalness={0.85} />
      </mesh>
      <mesh position={[0, -0.06, 0.09]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.18, 10]} />
        <meshStandardMaterial color="#cbb277" roughness={0.35} metalness={0.85} />
      </mesh>
      <mesh position={[0, 0.03, 0.17]}>
        <cylinderGeometry args={[0.075, 0.11, 0.16, 20, 1, true]} />
        <meshStandardMaterial
          ref={shadeRef}
          color="#fbf2e2"
          emissive={device.color}
          emissiveIntensity={0.35}
          roughness={0.85}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0.03, 0.02]}>
        <planeGeometry args={[0.95, 0.95]} />
        <meshBasicMaterial
          ref={glowRef}
          map={glowTexture}
          transparent
          opacity={0.12}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          color={device.color}
        />
      </mesh>
      <pointLight ref={lightRef} position={[0, 0.02, 0.2]} distance={4.6} decay={2} intensity={0} color={device.color} />
    </Clickable>
  )
}

/* -------------------------------------------------------------- table lamp */

export function TableLamp({ id, position = [0, 0, 0] }) {
  const device = useDevice(id)
  const { lightRef, shadeRef, glowRef } = useLightTransition(device, 4.4)
  if (!device) return null

  return (
    <Clickable id={id} position={position} labelOffset={[0, 0.66, 0]} childrenHighlight={false}>
      <mesh position={[0, 0.015, 0]}>
        <cylinderGeometry args={[0.115, 0.13, 0.03, 24]} />
        <meshStandardMaterial color="#2c2f33" roughness={0.35} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.018, 0.022, 0.3, 14]} />
        <meshStandardMaterial color="#b9a173" roughness={0.3} metalness={0.9} />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <coneGeometry args={[0.16, 0.26, 26, 1, true]} />
        <meshStandardMaterial
          ref={shadeRef}
          color="#fff4e2"
          emissive={device.color}
          emissiveIntensity={0.4}
          roughness={0.9}
          side={THREE.DoubleSide}
          transparent
          opacity={0.97}
        />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <sphereGeometry args={[0.17, 12, 10]} />
        <meshBasicMaterial
          ref={glowRef}
          map={glowTexture}
          transparent
          opacity={0.18}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          color={device.color}
        />
      </mesh>
      <pointLight ref={lightRef} position={[0, 0.4, 0]} distance={5} decay={2} intensity={0} color={device.color} />
    </Clickable>
  )
}

/* -------------------------------------------------------------- floor lamp */

export function FloorLamp({ id, position = [0, 0, 0] }) {
  const device = useDevice(id)
  const { lightRef, shadeRef, glowRef } = useLightTransition(device, 7)
  if (!device) return null

  return (
    <Clickable id={id} position={position} labelOffset={[0, 2.05, 0]} childrenHighlight={false}>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.19, 0.22, 0.04, 26]} />
        <meshStandardMaterial color="#2b2e31" roughness={0.35} metalness={0.65} />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <cylinderGeometry args={[0.022, 0.026, 1.54, 14]} />
        <meshStandardMaterial color="#3a3e42" roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[0, 1.68, 0]}>
        <cylinderGeometry args={[0.19, 0.22, 0.32, 28, 1, true]} />
        <meshStandardMaterial
          ref={shadeRef}
          color="#f7efdf"
          emissive={device.color}
          emissiveIntensity={0.4}
          roughness={0.95}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 1.842, 0]}>
        <circleGeometry args={[0.19, 24]} />
        <meshStandardMaterial color="#efe6d4" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.66, 0]}>
        <sphereGeometry args={[0.23, 12, 10]} />
        <meshBasicMaterial
          ref={glowRef}
          map={glowTexture}
          transparent
          opacity={0.16}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          color={device.color}
        />
      </mesh>
      <pointLight ref={lightRef} position={[0, 1.6, 0]} distance={6.5} decay={2} intensity={0} color={device.color} />
    </Clickable>
  )
}

/* ----------------------------------------------------------- under-cabinet */

/** Linear LED strip mounted under a kitchen wall cabinet. */
export function UnderCabinetLight({ id, position = [0, 0, 0], rotation = [0, 0, 0], length = 1.2 }) {
  const device = useDevice(id)
  const { lightRef, shadeRef, glowRef } = useLightTransition(device, 6)
  if (!device) return null

  return (
    <Clickable id={id} position={position} rotation={rotation} labelOffset={[0, 0.2, 0.15]} childrenHighlight={false}>
      <mesh position={[0, 0.01, 0]} castShadow>
        <boxGeometry args={[length, 0.035, 0.07]} />
        <meshStandardMaterial color="#d9dcdf" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, -0.012, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length - 0.04, 0.05]} />
        <meshStandardMaterial
          ref={shadeRef}
          color="#fff6e6"
          emissive={device.color}
          emissiveIntensity={0.5}
          roughness={0.6}
        />
      </mesh>
      <mesh position={[0, -0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length + 0.5, 1.1]} />
        <meshBasicMaterial
          ref={glowRef}
          map={glowTexture}
          transparent
          opacity={0.16}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          color={device.color}
        />
      </mesh>
      <pointLight ref={lightRef} position={[0, -0.1, 0]} distance={4.5} decay={2} intensity={0} color={device.color} />
    </Clickable>
  )
}

/* ------------------------------------------------------------- vanity bar */

/** Horizontal light bar above a bathroom mirror. */
export function VanityLight({ id, position = [0, 0, 0], rotation = [0, 0, 0], length = 0.7 }) {
  const device = useDevice(id)
  const { lightRef, shadeRef, glowRef } = useLightTransition(device, 9)
  if (!device) return null

  return (
    <Clickable id={id} position={position} rotation={rotation} labelOffset={[0, 0.3, 0.2]} childrenHighlight={false}>
      <mesh position={[0, 0.06, 0]} castShadow>
        <boxGeometry args={[length, 0.05, 0.06]} />
        <meshStandardMaterial color="#cbb277" roughness={0.32} metalness={0.85} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <capsuleGeometry args={[0.045, length - 0.1, 6, 14]} />
        <meshStandardMaterial
          ref={shadeRef}
          color="#ffffff"
          emissive={device.color}
          emissiveIntensity={0.5}
          roughness={0.5}
        />
      </mesh>
      <mesh position={[0, 0, 0.14]}>
        <planeGeometry args={[1.3, 1.0]} />
        <meshBasicMaterial
          ref={glowRef}
          map={glowTexture}
          transparent
          opacity={0.16}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          color={device.color}
        />
      </mesh>
      <pointLight ref={lightRef} position={[0, 0, 0.16]} distance={5} decay={2} intensity={0} color={device.color} />
    </Clickable>
  )
}

/** Renders the right fixture for a light device id. */
export function SmartLight({ kind, id, position, rotation = [0, 0, 0], withShadow = false, length }) {
  switch (kind) {
    case 'ceiling': return <CeilingLight id={id} position={position} withShadow={withShadow} />
    case 'wall': return <WallSconce id={id} position={position} rotation={rotation} />
    case 'table': return <TableLamp id={id} position={position} />
    case 'floor': return <FloorLamp id={id} position={position} />
    case 'undercab': return <UnderCabinetLight id={id} position={position} rotation={rotation} length={length} />
    case 'vanity': return <VanityLight id={id} position={position} rotation={rotation} length={length} />
    default: return null
  }
}
