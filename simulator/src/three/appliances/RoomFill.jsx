import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useRoomStore } from '../../store/useRoomStore'

const _c = new THREE.Color()

/**
 * Bounced room light.
 *
 * Every fixture already casts its own spot/point light, but those are tightly
 * focused, so switching them off barely changes how bright the room *feels* -
 * the daylight floor level dominates. This soft light sits at the ceiling and
 * rises and falls with the summed brightness of that room's lamps, mimicking
 * the light they bounce off the walls and floor. The result: turning a room's
 * lights off visibly darkens the space, and turning them on visibly fills it,
 * without having to tune every individual fixture.
 *
 * It never casts shadows and is purely derived from device state, so it stays
 * in sync with the control panel and the automation scenes.
 */
export function RoomFill({ roomId, position = [0, 2.6, 0], maxIntensity = 9, distance = 11 }) {
  const lightRef = useRef()
  const color = useRef(new THREE.Color('#ffdca8'))
  const devices = useRoomStore((s) => s.devices)

  let onSum = 0
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (const d of Object.values(devices)) {
    if (d.room !== roomId || d.type !== 'light' || !d.power) continue
    onSum += d.brightness ?? 1
    _c.set(d.color)
    r += _c.r
    g += _c.g
    b += _c.b
    n += 1
  }
  if (n > 0) color.current.setRGB(r / n, g / n, b / n)

  const target = maxIntensity * Math.min(1, onSum / 3.2)

  useFrame((_, delta) => {
    const light = lightRef.current
    if (!light) return
    const k = Math.min(1, delta * 5)
    light.intensity += (target - light.intensity) * k
    light.color.lerp(color.current, k)
  })

  return <pointLight ref={lightRef} position={position} distance={distance} decay={2} intensity={0} />
}
