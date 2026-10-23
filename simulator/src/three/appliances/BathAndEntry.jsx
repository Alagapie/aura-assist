import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { Clickable } from '../helpers/Clickable'
import { useDevice } from '../../store/useRoomStore'
import { sensorActive } from '../../config/devices'

/**
 * Walk-in shower: glass screen, rain head and a running water column driven by
 * the `shower` device. The stream fades in/out and a faint steam cloud drifts
 * while the water runs.
 */
export function Shower({ position = [8.4, 0, -8.1] }) {
  const device = useDevice('shower')
  const streamRef = useRef()
  const steamRefs = [useRef(), useRef(), useRef()]

  useFrame((state, delta) => {
    const k = Math.min(1, delta * 3)
    if (streamRef.current) {
      const target = device?.power ? 0.55 : 0
      streamRef.current.material.opacity += (target - streamRef.current.material.opacity) * k
      streamRef.current.position.y = 1.1
      if (device?.power) streamRef.current.material.map.offset.y -= delta * 2.4
    }
    steamRefs.forEach((ref, i) => {
      if (!ref.current) return
      if (device?.power) {
        const t = (state.clock.elapsedTime * 0.35 + i * 0.33) % 1
        ref.current.position.y = 1.4 + t * 1.1
        ref.current.material.opacity = 0.12 * (1 - t)
        ref.current.scale.setScalar(0.4 + t * 0.7)
      } else {
        ref.current.material.opacity = 0
      }
    })
  })

  const waterTexture = useMemo(() => {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 128
    const ctx = canvas.getContext('2d')
    const grad = ctx.createLinearGradient(0, 0, 32, 0)
    grad.addColorStop(0, 'rgba(180,220,255,0.1)')
    grad.addColorStop(0.5, 'rgba(220,240,255,0.75)')
    grad.addColorStop(1, 'rgba(180,220,255,0.1)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 32, 128)
    for (let i = 0; i < 26; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.4})`
      ctx.fillRect(Math.random() * 30, Math.random() * 124, 2, 6 + Math.random() * 14)
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(1, 2)
    return tex
  }, [])

  if (!device) return null

  return (
    <group position={position}>
      {/* tiled tray + drain */}
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[1.5, 0.06, 1.5]} />
        <meshStandardMaterial color="#cdd6da" roughness={0.35} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.062, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.07, 20]} />
        <meshStandardMaterial color="#87909a" roughness={0.3} metalness={0.85} />
      </mesh>

      {/* riser + rain head on the east wall */}
      <mesh position={[0.62, 1.35, 0]} castShadow>
        <cylinderGeometry args={[0.016, 0.016, 2.5, 12]} />
        <meshStandardMaterial color="#b7bec6" roughness={0.25} metalness={0.9} />
      </mesh>
      <mesh position={[0.62, 2.6, -0.35]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.7, 10]} />
        <meshStandardMaterial color="#b7bec6" roughness={0.25} metalness={0.9} />
      </mesh>
      <Clickable id="shower" position={[0.62, 2.5, -0.7]} labelOffset={[0.3, 0.35, 0]} childrenHighlight={false}>
        <mesh castShadow>
          <cylinderGeometry args={[0.16, 0.14, 0.05, 24]} />
          <meshStandardMaterial
            color="#cdd4da"
            roughness={0.25}
            metalness={0.85}
            emissive={device.power ? '#9fd8ff' : '#000000'}
            emissiveIntensity={device.power ? 0.35 : 0}
          />
        </mesh>
        <mesh position={[0, -0.028, 0]}>
          <circleGeometry args={[0.13, 24]} />
          <meshStandardMaterial color={device.power ? '#bfe4ff' : '#9aa3ab'} roughness={0.4} />
        </mesh>
        {/* mixer valve */}
        <mesh position={[0, -0.55, 0.55]}>
          <cylinderGeometry args={[0.05, 0.05, 0.06, 16]} />
          <meshStandardMaterial color="#c2c9d0" roughness={0.3} metalness={0.85} />
        </mesh>
      </Clickable>

      {/* water stream */}
      <mesh ref={streamRef} position={[0.62, 1.1, -0.7]}>
        <cylinderGeometry args={[0.035, 0.06, 2.4, 10, 1, true]} />
        <meshBasicMaterial
          map={waterTexture}
          color="#cfe8ff"
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* steam puffs */}
      {steamRefs.map((ref, i) => (
        <mesh key={i} ref={ref} position={[0.62, 1.4, -0.7]}>
          <sphereGeometry args={[0.3, 10, 8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}

      {/* glass screen */}
      <mesh position={[-0.75, 1.05, 0]} castShadow>
        <boxGeometry args={[0.02, 2.1, 1.5]} />
        <meshPhysicalMaterial
          color="#dceef6"
          transmission={0.9}
          transparent
          opacity={0.3}
          roughness={0.05}
          thickness={0.02}
          ior={1.4}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* screen frame */}
      <mesh position={[-0.75, 2.1, 0]}>
        <boxGeometry args={[0.03, 0.04, 1.5]} />
        <meshStandardMaterial color="#aeb6bd" roughness={0.3} metalness={0.8} />
      </mesh>
      {/* towel on the rail */}
      <mesh position={[-0.74, 1.25, 0.45]} castShadow>
        <boxGeometry args={[0.05, 0.55, 0.34]} />
        <meshStandardMaterial color="#e8e2d6" roughness={0.95} />
      </mesh>
    </group>
  )
}

/**
 * Ceiling exhaust fan: a grille with a spinner that follows the device speed.
 * Shared between the bathroom (`bathFan`) - the kitchen uses the range hood.
 */
export function ExhaustFan({ id = 'bathFan', position = [6.5, 2.96, -6] }) {
  const device = useDevice(id)
  const spinRef = useRef()

  useFrame((_, delta) => {
    if (!spinRef.current) return
    const target = device?.power ? 5 + (device?.speed ?? 1) * 5 : 0
    const current = spinRef.current.userData.speed ?? 0
    const next = current + (target - current) * Math.min(1, delta * 2)
    spinRef.current.userData.speed = next
    spinRef.current.rotation.y += next * delta
  })

  if (!device) return null

  return (
    <Clickable id={id} position={position} labelOffset={[0, 0.2, 0.3]} childrenHighlight={false}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.05, 24]} />
        <meshStandardMaterial color="#f0f1f2" roughness={0.6} />
      </mesh>
      <group ref={spinRef} position={[0, -0.026, 0]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <boxGeometry args={[0.22, 0.008, 0.045]} />
            <meshStandardMaterial
              color={device.power ? '#7a828a' : '#c4c9ce'}
              roughness={0.5}
              metalness={0.3}
            />
          </mesh>
        ))}
      </group>
      {/* concentric grille */}
      {[0.08, 0.13].map((r) => (
        <mesh key={r} position={[0, -0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r, 0.006, 8, 28]} />
          <meshStandardMaterial color="#e3e5e8" roughness={0.55} />
        </mesh>
      ))}
    </Clickable>
  )
}

/**
 * Front-door smart lock: a deadbolt escutcheon whose LED and bolt follow the
 * `doorLock` device. Clicking toggles locked/unlocked.
 */
export function SmartLock({ position = [3.62, 1.1, 5.44], rotation = [0, Math.PI, 0] }) {
  const device = useDevice('doorLock')
  const boltRef = useRef()

  useFrame((_, delta) => {
    if (!boltRef.current) return
    const target = device?.locked ? 0 : 0.07
    boltRef.current.position.x += (target - boltRef.current.position.x) * Math.min(1, delta * 6)
  })

  if (!device) return null

  return (
    <Clickable id="doorLock" position={position} rotation={rotation} labelOffset={[0, 0.4, 0.2]} childrenHighlight={false}>
      {/* backplate */}
      <RoundedBox args={[0.1, 0.26, 0.045]} radius={0.02} smoothness={3} castShadow>
        <meshStandardMaterial color="#3a3f45" roughness={0.35} metalness={0.75} />
      </RoundedBox>
      {/* thumb turn */}
      <mesh position={[0, 0, 0.05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.028, 0.028, 0.06, 18]} />
        <meshStandardMaterial color="#c9cdd2" roughness={0.3} metalness={0.85} />
      </mesh>
      <mesh position={[0, 0, 0.08]} rotation={[Math.PI / 2, 0, device.locked ? 0 : Math.PI / 2]}>
        <boxGeometry args={[0.02, 0.05, 0.05]} />
        <meshStandardMaterial color="#dfe3e7" roughness={0.3} metalness={0.8} />
      </mesh>
      {/* status LED */}
      <mesh position={[0, -0.09, 0.026]}>
        <circleGeometry args={[0.014, 14]} />
        <meshStandardMaterial
          color={device.locked ? '#123' : '#30120a'}
          emissive={device.locked ? '#7dffbf' : '#ff8a4c'}
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>
      {/* bolt (visible edge-on when unlocked) */}
      <mesh ref={boltRef} position={[0.05, 0, 0]}>
        <boxGeometry args={[0.05, 0.045, 0.03]} />
        <meshStandardMaterial color="#b9c0c7" roughness={0.3} metalness={0.9} />
      </mesh>
    </Clickable>
  )
}

/** Round doorbell button beside the main entrance; flashes while ringing. */
export function Doorbell({ position = [4.0, 1.28, 5.44], rotation = [0, Math.PI, 0] }) {
  const device = useDevice('doorbell')
  const ringRef = useRef()

  useFrame((state) => {
    if (!ringRef.current) return
    const base = device?.ringing ? 2.6 : 0.25
    const pulse = device?.ringing ? Math.sin(state.clock.elapsedTime * 10) * 1.2 : 0
    ringRef.current.emissiveIntensity = base + pulse
  })

  if (!device) return null

  return (
    <Clickable id="doorbell" position={position} rotation={rotation} labelOffset={[0, 0.32, 0.15]} childrenHighlight={false}>
      <mesh castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.03, 24]} />
        <meshStandardMaterial color="#2e3338" roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <cylinderGeometry args={[0.032, 0.032, 0.018, 24]} />
        <meshStandardMaterial ref={ringRef} color="#e8edf2" emissive="#7de6ff" emissiveIntensity={0.25} toneMapped={false} />
      </mesh>
      {/* camera dot */}
      <mesh position={[0, 0.12, 0.015]}>
        <cylinderGeometry args={[0.018, 0.018, 0.02, 16]} />
        <meshStandardMaterial color="#101418" roughness={0.2} metalness={0.6} />
      </mesh>
      <pointLight
        position={[0, 0, 0.12]}
        intensity={device.ringing ? 2.4 : 0}
        distance={1.6}
        color="#7de6ff"
      />
    </Clickable>
  )
}

/**
 * Generic small sensor puck (occupancy / water / entry contact). Its LED turns
 * amber when the reading is `triggered`/`open`, teal when clear.
 */
export function SensorPuck({ id, position, rotation = [0, 0, 0], labelOffset = [0, 0.22, 0.12] }) {
  const device = useDevice(id)
  const ledRef = useRef()
  const active = sensorActive(device)

  useFrame((state) => {
    if (!ledRef.current) return
    const glow = active ? 2 + Math.sin(state.clock.elapsedTime * 5) * 1.1 : 0.18
    ledRef.current.emissiveIntensity += (glow - ledRef.current.emissiveIntensity) * 0.15
  })

  if (!device) return null

  return (
    <Clickable id={id} position={position} rotation={rotation} labelOffset={labelOffset} childrenHighlight={false}>
      <mesh castShadow>
        <cylinderGeometry args={[0.045, 0.05, 0.03, 20]} />
        <meshStandardMaterial color="#f2f3f4" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.017, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.008, 14]} />
        <meshStandardMaterial
          ref={ledRef}
          color={active ? '#3a2408' : '#0a2a20'}
          emissive={active ? '#ffb04c' : '#7dffbf'}
          emissiveIntensity={0.18}
          toneMapped={false}
        />
      </mesh>
    </Clickable>
  )
}
