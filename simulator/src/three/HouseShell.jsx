import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import {
  HOUSE_HEIGHT, ROOM_LIST, ROOMS, OPENINGS, OPENING_BY_ID, WINDOWS,
  DOOR_LEAF_PLACEMENT, DOOR_FINISH, openingServesRoom,
} from '../config/house'
import { useRoomStore } from '../store/useRoomStore'
import { buildRoomWalls } from './helpers/wallBuild'
import { makeWallGeometry } from './helpers/roomGeometry'
import { Door } from './appliances/Door'
import {
  createPlasterTexture, createWoodTexture, createTileTexture,
} from './helpers/textures'

/* Per-room look: wall colour + floor material. */
const ROOM_STYLE = {
  living: { wall: '#ece6dd', floor: 'wood' },
  bedroom: { wall: '#e6dfd6', floor: 'carpet' },
  kitchen: { wall: '#eef0ec', floor: 'tile' },
  bathroom: { wall: '#e7eef1', floor: 'tile' },
  hallway: { wall: '#e9e3da', floor: 'wood' },
}

/** A single floor slab. */
function Floor({ room, materials }) {
  const w = room.x1 - room.x0
  const d = room.z1 - room.z0
  const cx = (room.x0 + room.x1) / 2
  const cz = (room.z0 + room.z1) / 2
  const mat = materials.floors[room.floor]
  return (
    <mesh material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} receiveShadow>
      <planeGeometry args={[w, d]} />
    </mesh>
  )
}

/** Ceiling slab so walk-mode and the overview read as an enclosed house. */
function Ceiling({ room, materials }) {
  const w = room.x1 - room.x0
  const d = room.z1 - room.z0
  const cx = (room.x0 + room.x1) / 2
  const cz = (room.z0 + room.z1) / 2
  return (
    <mesh material={materials.ceiling} rotation={[Math.PI / 2, 0, 0]} position={[cx, HOUSE_HEIGHT, cz]}>
      <planeGeometry args={[w, d]} />
    </mesh>
  )
}

/** The four inward-facing walls of one room, with door/window openings. */
function RoomWalls({ room, materials, walls, registerWall }) {
  const geoms = useMemo(
    () => walls.map((w) => makeWallGeometry(w.width, HOUSE_HEIGHT, w.holes)),
    [walls],
  )
  return (
    <group>
      {walls.map((wall, i) => (
        <mesh
          key={`${room.id}-w${i}`}
          ref={(el) => registerWall(i, el)}
          material={materials.walls[room.id]}
          position={[wall.center[0], HOUSE_HEIGHT / 2, wall.center[1]]}
          rotation={wall.rotation}
          receiveShadow
        >
          <primitive object={geoms[i]} attach="geometry" />
        </mesh>
      ))}
      {/* skirting board around the room perimeter */}
      <Skirting room={room} materials={materials} />
    </group>
  )
}

/**
 * One room's architectural shell (floor, ceiling, walls, skirting).
 *
 * In the isolated room view every other room is hidden, so this component also
 * owns the *cutaway*: while `cutaway` is set it hides, every frame, the walls
 * that sit between the camera and the room, and the ceiling once the camera is
 * outside the room's footprint or above it. The room can then be orbited and
 * pulled back like a doll's-house box - you are always looking in - while from
 * *inside* the room all four walls and the ceiling stay put, because the same
 * test keeps a wall whenever the camera is on its inner side.
 */
function RoomShell({ room, materials, visible, cutaway }) {
  const walls = useMemo(() => buildRoomWalls(room, OPENINGS), [room])
  /* Outward normal of each wall, in world XZ: which half-space is "outside". */
  const normals = useMemo(() => walls.map((w) => (w.axis === 'z'
    ? (w.line < (room.z0 + room.z1) / 2 ? [0, -1] : [0, 1])
    : (w.line < (room.x0 + room.x1) / 2 ? [-1, 0] : [1, 0]))), [walls, room])
  const wallRefs = useRef([])
  const ceilRef = useRef()

  useFrame(({ camera }) => {
    if (!cutaway) return
    const { x, y, z } = camera.position
    wallRefs.current.forEach((mesh, i) => {
      if (!mesh) return
      const [nx, nz] = normals[i]
      const [wx, wz] = walls[i].center
      mesh.visible = nx * (x - wx) + nz * (z - wz) < 0.02
    })
    const inside = x > room.x0 - 0.02 && x < room.x1 + 0.02
      && z > room.z0 - 0.02 && z < room.z1 + 0.02
    if (ceilRef.current) ceilRef.current.visible = inside && y < HOUSE_HEIGHT - 0.05
  })

  // Put anything the cutaway hid back when it switches off.
  useEffect(() => {
    if (cutaway) return
    wallRefs.current.forEach((m) => { if (m) m.visible = true })
    if (ceilRef.current) ceilRef.current.visible = true
  }, [cutaway])

  return (
    <group visible={visible}>
      <Floor room={room} materials={materials} />
      <group ref={ceilRef}>
        <Ceiling room={room} materials={materials} />
      </group>
      <RoomWalls
        room={room}
        materials={materials}
        walls={walls}
        registerWall={(i, el) => { wallRefs.current[i] = el }}
      />
    </group>
  )
}

function Skirting({ room, materials }) {
  const items = []
  const t = 0.018
  const h = 0.09
  const edges = [
    { c: [(room.x0 + room.x1) / 2, room.z0], s: [room.x1 - room.x0, t], r: 0 },
    { c: [(room.x0 + room.x1) / 2, room.z1], s: [room.x1 - room.x0, t], r: 0 },
    { c: [room.x0, (room.z0 + room.z1) / 2], s: [t, room.z1 - room.z0], r: 0 },
    { c: [room.x1, (room.z0 + room.z1) / 2], s: [t, room.z1 - room.z0], r: 0 },
  ]
  edges.forEach((e, i) => {
    items.push(
      <mesh key={`s${i}`} material={materials.skirting} position={[e.c[0], h / 2, e.c[1]]}>
        <boxGeometry args={[e.s[0], h, e.s[1]]} />
      </mesh>,
    )
  })
  return <group>{items}</group>
}

/** Window glazing + frame + sill, rendered once per distinct window. */
function WindowJoinery({ opening, materials }) {
  return useMemo(() => {
    const half = opening.width / 2
    const yc = (opening.y0 + opening.y1) / 2
    const hh = opening.y1 - opening.y0
    const vertical = opening.axis === 'x'
    // local frame: the window lives in the wall plane; push glazing slightly out
    const glassArgs = vertical ? [0.02, hh, opening.width] : [opening.width, hh, 0.02]
    const frameT = 0.06
    return (
      <group position={vertical ? [opening.line, 0, opening.along] : [opening.along, 0, opening.line]}>
        {/* glass */}
        <mesh material={materials.glass} position={[0, yc, 0]}>
          <boxGeometry args={glassArgs} />
        </mesh>
        {/* frame: two uprights + head + sill, oriented to the wall */}
        {[[-half, 0], [half, 0]].map(([off], i) => (
          <mesh key={`u${i}`} material={materials.frame}
            position={vertical ? [0, yc, off] : [off, yc, 0]}>
            <boxGeometry args={vertical ? [0.12, hh + frameT, frameT] : [frameT, hh + frameT, 0.12]} />
          </mesh>
        ))}
        <mesh material={materials.frame} position={vertical ? [0, opening.y1, 0] : [0, opening.y1, 0]}>
          <boxGeometry args={vertical ? [0.12, frameT, opening.width + frameT] : [opening.width + frameT, frameT, 0.12]} />
        </mesh>
        <mesh material={materials.frame} position={[0, opening.y0 - 0.02, 0]} receiveShadow>
          <boxGeometry args={vertical ? [0.2, 0.05, opening.width + 0.2] : [opening.width + 0.2, 0.05, 0.2]} />
        </mesh>
        {/* centre mullion */}
        <mesh material={materials.frame} position={[0, yc, 0]}>
          <boxGeometry args={vertical ? [0.08, hh, 0.04] : [0.04, hh, 0.08]} />
        </mesh>
      </group>
    )
  }, [opening, materials])
}

/**
 * The full architectural shell of the house: a floor, a ceiling and four
 * inward-facing walls for every room, all shared doorways cut through, window
 * joinery, the interactive door leaves, and the exterior ground/sky backdrop.
 *
 * Each room draws its own boundary walls. Where two rooms meet, both panels
 * exist but face opposite directions, so only the near one is visible and the
 * shared doorway lines up exactly - the whole house reads as one connected
 * space rather than a stack of separate dioramas.
 */
export function HouseShell() {
  const materials = useMemo(() => {
    const floors = {
      wood: new THREE.MeshStandardMaterial({ map: createWoodTexture({ repeat: [4, 4] }), roughness: 0.62, metalness: 0.02 }),
      carpet: new THREE.MeshStandardMaterial({ color: '#9a9086', roughness: 0.98, metalness: 0 }),
      tile: new THREE.MeshStandardMaterial({ map: createTileTexture({ repeat: [5, 5] }), roughness: 0.35, metalness: 0.06 }),
    }
    const walls = {}
    for (const room of ROOM_LIST) {
      walls[room.id] = new THREE.MeshStandardMaterial({
        map: createPlasterTexture({ repeat: [3, 1.6], color: ROOM_STYLE[room.id].wall }),
        roughness: 0.95,
        metalness: 0,
        side: THREE.FrontSide,
      })
    }
    return {
      floors,
      walls,
      ceiling: new THREE.MeshStandardMaterial({ color: '#f4f1ec', roughness: 1 }),
      skirting: new THREE.MeshStandardMaterial({ color: '#efeae1', roughness: 0.6 }),
      frame: new THREE.MeshStandardMaterial({ color: '#f3efe8', roughness: 0.6 }),
      glass: new THREE.MeshPhysicalMaterial({
        color: '#cfe2ee', transmission: 0.92, transparent: true, opacity: 0.35,
        roughness: 0.06, metalness: 0, thickness: 0.02, ior: 1.45, side: THREE.DoubleSide,
      }),
      ground: new THREE.MeshStandardMaterial({ color: '#6f7d5f', roughness: 1 }),
      backdrop: new THREE.MeshBasicMaterial({ color: '#b7ccdb', side: THREE.BackSide }),
    }
  }, [])

  const cameraMode = useRoomStore((s) => s.cameraMode)
  const view = useRoomStore((s) => s.view)
  const roomIsolation = useRoomStore((s) => s.roomIsolation)
  const currentRoom = useRoomStore((s) => s.currentRoom)
  /* The isolated "one room on its own" view: orbit mode, a room selected, and
   * containment on. Every other room and the whole exterior are hidden so the
   * camera can orbit and pull back around just this room without ever showing
   * the outside. */
  const isolated = cameraMode === 'orbit' && view === 'room' && roomIsolation
  const soloRoom = isolated ? (ROOMS[currentRoom] || ROOMS.living) : null

  return (
    <group>
      {ROOM_LIST.map((room) => (
        <RoomShell
          key={room.id}
          room={room}
          materials={materials}
          visible={!isolated || room.id === currentRoom}
          cutaway={isolated && room.id === currentRoom}
        />
      ))}

      {WINDOWS.filter((w) => !soloRoom || openingServesRoom(w, soloRoom)).map((w) => (
        <WindowJoinery key={w.id} opening={w} materials={materials} />
      ))}

      {/* Interactive door leaves, one per distinct doorway. */}
      {Object.entries(DOOR_LEAF_PLACEMENT)
        .map(([id, place]) => ({ id, place, opening: OPENING_BY_ID[id] }))
        .filter(({ opening }) => !soloRoom || (opening && openingServesRoom(opening, soloRoom)))
        .map(({ id, place, opening }) => {
          const finish = DOOR_FINISH[id] || {}
          return (
            <Door
              key={id}
              id={id}
              position={[place.hinge[0], 0, place.hinge[1]]}
              rotation={[0, place.rotY, 0]}
              width={opening ? opening.width : 0.95}
              height={opening ? opening.y1 : 2.1}
              openAngle={place.openAngle ?? -1.6}
              panelColor={finish.panelColor}
              trimColor={finish.trimColor}
              frameDepth={finish.frameDepth ?? 0.04}
              handleSide="right"
            />
          )
        })}

      {/* Exterior ground + sky dome seen through the openings. */}
      <group visible={!isolated}>
        <mesh material={materials.ground} rotation={[-Math.PI / 2, 0, 0]} position={[2.5, -0.02, -1.5]} receiveShadow>
          <planeGeometry args={[70, 70]} />
        </mesh>
        <mesh material={materials.backdrop}>
          <sphereGeometry args={[46, 24, 16]} />
        </mesh>
      </group>
    </group>
  )
}
