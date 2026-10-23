import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import { useRoomStore } from '../store/useRoomStore'
import { ROOMS, walkPassable, clampToHouse, getRoomAt } from '../config/house'

const EYE_HEIGHT = 1.62
const WALK_SPEED = 1.9
const RUN_SPEED = 3.3
const UP = new THREE.Vector3(0, 1, 0)

/**
 * First-person walkthrough mode: walk the whole house from the inside.
 *
 * drei's PointerLockControls redirects React Three Fiber pointer events to the
 * centre of the screen while the pointer is locked, so the same clickable
 * objects keep working: aim with the mouse, click to toggle. WASD moves, shift
 * runs, escape releases the pointer.
 *
 * Movement is constrained by the shared `walkPassable` helper: you slide along
 * walls and can only cross into another room through an opening whose door is
 * actually open. The camera is spawned at the current room's spawn point.
 */
export function WalkMode() {
  const { camera } = useThree()
  const keys = useRef({})
  const velocity = useRef(new THREE.Vector3())
  const setLocked = useRoomStore((s) => s.setWalkLocked)
  const setCurrentRoom = useRoomStore((s) => s.setCurrentRoom)
  const currentRoom = useRoomStore((s) => s.currentRoom)

  // Spawn inside the room the user was looking at, facing its centre.
  const spawnRoom = useRef(currentRoom)
  useEffect(() => {
    const room = ROOMS[spawnRoom.current] || ROOMS.living
    const [sx, sz] = room.spawn || [0, 0]
    camera.position.set(sx, EYE_HEIGHT, sz)
    camera.lookAt((room.x0 + room.x1) / 2, EYE_HEIGHT - 0.15, (room.z0 + room.z1) / 2)
    return () => setLocked(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera])

  useEffect(() => {
    const down = (e) => {
      keys.current[e.code] = true
    }
    const up = (e) => {
      keys.current[e.code] = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useFrame((_, delta) => {
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1)
    forward.normalize()
    const right = new THREE.Vector3().crossVectors(forward, UP).normalize()

    const move = new THREE.Vector3()
    const k = keys.current
    if (k.KeyW || k.ArrowUp) move.add(forward)
    if (k.KeyS || k.ArrowDown) move.sub(forward)
    if (k.KeyD || k.ArrowRight) move.add(right)
    if (k.KeyA || k.ArrowLeft) move.sub(right)

    const speed = k.ShiftLeft || k.ShiftRight ? RUN_SPEED : WALK_SPEED
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed)
    velocity.current.lerp(move, Math.min(1, delta * 9))

    const dx = velocity.current.x * delta
    const dz = velocity.current.z * delta
    if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) {
      camera.position.y = EYE_HEIGHT
      return
    }

    const isDoorOpen = (id) => useRoomStore.getState().devices[id]?.open === true
    const cur = [camera.position.x, camera.position.z]

    // Axis-separated so the walker slides along a wall instead of sticking.
    let nx = cur[0]
    let nz = cur[1]
    if (Math.abs(dx) > 1e-6) {
      const cand = clampToHouse(cur[0] + dx, cur[1])
      if (walkPassable(cur, cand, isDoorOpen)) nx = cand[0]
      else velocity.current.x = 0
    }
    if (Math.abs(dz) > 1e-6) {
      const cand = clampToHouse(nx, cur[1] + dz)
      if (walkPassable([nx, cur[1]], cand, isDoorOpen)) nz = cand[1]
      else velocity.current.z = 0
    }

    camera.position.set(nx, EYE_HEIGHT, nz)

    // Let the UI follow the walker from room to room.
    const roomNow = getRoomAt(nx, nz)
    if (roomNow && roomNow.id !== currentRoom) setCurrentRoom(roomNow.id)
  })

  return (
    <PointerLockControls
      selector=".lock-surface"
      makeDefault
      onLock={() => setLocked(true)}
      onUnlock={() => setLocked(false)}
    />
  )
}
