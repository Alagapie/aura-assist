/**
 * Automated checks for the pure model layers of the Smart Home Simulator.
 *
 * Everything asserted here is import-safe in plain Node (no React, no THREE,
 * no bundler), which is exactly why the architecture keeps `config/house.js`,
 * `config/devices.js` and `automation/modes.js` free of JSX and of any
 * renderer-specific dependency. The tests therefore verify the parts that the
 * 3D scene, the UI and the (future) AI facade all share.
 *
 * Run with:  node scripts/test-house.mjs
 */

import assert from 'node:assert/strict'

import {
  HOUSE_HEIGHT,
  ROOM_LIST,
  ROOMS,
  OPENINGS,
  OPENING_BY_ID,
  DOORS,
  WINDOWS,
  DOOR_LEAF_PLACEMENT,
  DOOR_FINISH,
  PLAYER_RADIUS,
  HOUSE_BOUNDS,
  DEFAULT_FOV,
  DINING_TABLE,
  SEATING,
  seatFacing,
  seatOffScreenAngle,
  getRoomAt,
  roomsOverlap,
  sharedEdge,
  walkPassable,
  clampToHouse,
  roomEdges,
  HOUSE_ENVELOPE,
  EXTERIOR,
  ROOF,
  roomViewPreset,
  roomViewCount,
} from '../src/config/house.js'

import {
  createInitialDevices,
  DEVICE_GROUPS,
  groupForDevice,
  isDeviceOn,
  describeDevice,
  getPrimaryAction,
  SENSOR_STATES,
  nextSensorValue,
  sensorActive,
  LIGHT_IDS,
} from '../src/config/devices.js'

import { MODE_LIST, MODE_PATCHES } from '../src/automation/modes.js'

import { parseCommand } from '../src/assistant/brain.js'

import {
  devicePower,
  houseEnergyReport,
  climateReport,
  accumulateEnergy,
  formatWatts,
  formatKwh,
  formatCost,
  POWER_W,
  TARIFF,
} from '../src/config/reports.js'

import { buildEnvelopeWalls } from '../src/three/helpers/wallBuild.js'

/* --------------------------------------------------------------- harness -- */

let passed = 0
let failed = 0
const failures = []

function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  \u2713 ${name}`)
  } catch (error) {
    failed += 1
    failures.push({ name, error })
    console.log(`  \u2717 ${name}`)
    console.log(`      ${error.message.split('\n')[0]}`)
  }
}

function group(title) {
  console.log(`\n${title}`)
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps
const rect = (r) => ({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 })

/* ---------------------------------------------------------------- rooms --- */

group('House layout: rooms')

test('every room is well formed (x0 < x1, z0 < z1, height set)', () => {
  assert.ok(HOUSE_HEIGHT > 0)
  for (const room of ROOM_LIST) {
    assert.ok(room.x1 > room.x0, `${room.id}: x1 must exceed x0`)
    assert.ok(room.z1 > room.z0, `${room.id}: z1 must exceed z0`)
    assert.ok(room.label && room.short, `${room.id}: needs a label and short name`)
    assert.ok(Array.isArray(room.camera.position) && room.camera.position.length === 3)
    assert.ok(Array.isArray(room.camera.target) && room.camera.target.length === 3)
    assert.ok(Array.isArray(room.spawn) && room.spawn.length === 2)
  }
})

test('there are five connected areas with unique ids', () => {
  assert.equal(ROOM_LIST.length, 5)
  const ids = ROOM_LIST.map((r) => r.id)
  assert.deepEqual([...new Set(ids)], ids, 'ids must be unique')
  assert.deepEqual(ids.sort(), ['bathroom', 'bedroom', 'hallway', 'kitchen', 'living'])
  assert.equal(Object.keys(ROOMS).length, ROOM_LIST.length)
})

test('no two rooms overlap', () => {
  for (let i = 0; i < ROOM_LIST.length; i += 1) {
    for (let j = i + 1; j < ROOM_LIST.length; j += 1) {
      assert.ok(
        !roomsOverlap(rect(ROOM_LIST[i]), rect(ROOM_LIST[j])),
        `${ROOM_LIST[i].id} overlaps ${ROOM_LIST[j].id}`,
      )
    }
  }
})

test('the rooms tile the house envelope without gaps', () => {
  const minX = Math.min(...ROOM_LIST.map((r) => r.x0))
  const maxX = Math.max(...ROOM_LIST.map((r) => r.x1))
  const minZ = Math.min(...ROOM_LIST.map((r) => r.z0))
  const maxZ = Math.max(...ROOM_LIST.map((r) => r.z1))
  const area = ROOM_LIST.reduce((sum, r) => sum + (r.x1 - r.x0) * (r.z1 - r.z0), 0)
  const envelope = (maxX - minX) * (maxZ - minZ)
  assert.ok(near(area, envelope, 1e-9), `room area ${area} != envelope ${envelope}`)
})

test('the living room keeps its original footprint', () => {
  const living = ROOMS.living
  assert.deepEqual(rect(living), { x0: -4, x1: 4, z0: -3, z1: 3 })
})

test('getRoomAt finds the containing room and rejects the void', () => {
  assert.equal(getRoomAt(0, 0)?.id, 'living')
  assert.equal(getRoomAt(6.5, 0)?.id, 'kitchen')
  assert.equal(getRoomAt(0, -6)?.id, 'bedroom')
  assert.equal(getRoomAt(6.5, -6)?.id, 'bathroom')
  assert.equal(getRoomAt(0, 4.2)?.id, 'hallway')
  assert.equal(getRoomAt(50, 50), null)
  assert.equal(getRoomAt(-50, -50), null)
})

test('every spawn point is inside its own room', () => {
  for (const room of ROOM_LIST) {
    const [sx, sz] = room.spawn
    const found = getRoomAt(sx, sz)
    assert.ok(found, `${room.id}: spawn is outside the house`)
    assert.equal(found.id, room.id, `${room.id}: spawn lands in ${found?.id}`)
  }
})

test('every camera position is inside its own room (single-sided walls)', () => {
  for (const room of ROOM_LIST) {
    const [x, , z] = room.camera.position
    const found = getRoomAt(x, z)
    assert.ok(found, `${room.id}: camera is outside the house`)
    assert.equal(found.id, room.id, `${room.id}: camera sits in ${found?.id}`)
  }
})

test('every room edge is described with an inward side', () => {
  for (const room of ROOM_LIST) {
    const edges = roomEdges(room)
    assert.equal(edges.length, 4)
    assert.deepEqual(edges.map((e) => e.side).sort(), ['east', 'north', 'south', 'west'])
  }
})

/* ------------------------------------------------------ shared boundaries -- */

group('House layout: connectivity')

test('every adjacent room pair shares exactly one edge', () => {
  // living<->bedroom, living<->hall, living<->kitchen, kitchen<->hall,
  // kitchen<->bath, bedroom<->bath
  const pairs = [
    ['living', 'bedroom'], ['living', 'hallway'], ['living', 'kitchen'],
    ['kitchen', 'hallway'], ['kitchen', 'bathroom'], ['bedroom', 'bathroom'],
  ]
  for (const [a, b] of pairs) {
    if (a === b) continue
    const edge = sharedEdge(ROOMS[a], ROOMS[b])
    assert.ok(edge, `${a} and ${b} should be adjacent`)
    assert.ok(edge.hi > edge.lo, `${a}-${b} shared edge has no length`)
  }
})

test('non-adjacent rooms share no edge', () => {
  assert.equal(sharedEdge(ROOMS.bedroom, ROOMS.hallway), null)
  assert.equal(sharedEdge(ROOMS.living, ROOMS.bathroom), null)
})

test('the house is connected: every room is reachable from the living room', () => {
  const adjacency = new Map(ROOM_LIST.map((r) => [r.id, []]))
  for (let i = 0; i < ROOM_LIST.length; i += 1) {
    for (let j = i + 1; j < ROOM_LIST.length; j += 1) {
      if (sharedEdge(ROOM_LIST[i], ROOM_LIST[j])) {
        adjacency.get(ROOM_LIST[i].id).push(ROOM_LIST[j].id)
        adjacency.get(ROOM_LIST[j].id).push(ROOM_LIST[i].id)
      }
    }
  }
  const seen = new Set(['living'])
  const queue = ['living']
  while (queue.length) {
    const id = queue.shift()
    for (const next of adjacency.get(id)) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  assert.equal(seen.size, ROOM_LIST.length, `rooms not reachable from the living room: ${ROOM_LIST.map((r) => r.id).filter((id) => !seen.has(id)).join(', ')}`)
})

/* ------------------------------------------------------------- openings --- */

group('House layout: openings')

test('every opening has a valid axis, span and height range', () => {
  for (const o of OPENINGS) {
    assert.ok(o.kind === 'door' || o.kind === 'window', `${o.id}: unknown kind`)
    assert.ok(o.axis === 'x' || o.axis === 'z', `${o.id}: unknown axis`)
    assert.ok(o.width > 0 && o.width < 4, `${o.id}: implausible width`)
    assert.ok(o.y1 > o.y0, `${o.id}: y1 must exceed y0`)
    assert.ok(o.y1 <= HOUSE_HEIGHT + 1e-9, `${o.id}: taller than the house`)
  }
})

test('every opening sits exactly on a room edge (or a shared boundary)', () => {
  for (const o of OPENINGS) {
    const onSomeEdge = ROOM_LIST.some((room) =>
      roomEdges(room).some((edge) => edge.axis === o.axis && near(edge.line, o.line)))
    assert.ok(onSomeEdge, `${o.id}: line ${o.line} is not a wall`)
  }
})

test('every opening fits inside the wall it sits on', () => {
  for (const o of OPENINGS) {
    const lo = o.along - o.width / 2
    const hi = o.along + o.width / 2
    const walls = ROOM_LIST.flatMap((room) => roomEdges(room))
      .filter((edge) => edge.axis === o.axis && near(edge.line, o.line))
    const fits = walls.some((wall) => {
      const wlo = Math.min(wall.from, wall.to)
      const whi = Math.max(wall.from, wall.to)
      return lo >= wlo - 1e-9 && hi <= whi + 1e-9
    })
    assert.ok(fits, `${o.id}: opening [${lo}, ${hi}] sticks out of its wall`)
  }
})

test('openings do not overlap each other on the same wall', () => {
  const byWall = new Map()
  for (const o of OPENINGS) {
    const key = `${o.axis}:${o.line}`
    if (!byWall.has(key)) byWall.set(key, [])
    byWall.get(key).push(o)
  }
  for (const [key, list] of byWall) {
    const sorted = [...list].sort((a, b) => a.along - b.along)
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1]
      const gap = (sorted[i].along - sorted[i].width / 2) - (prev.along + prev.width / 2)
      assert.ok(gap >= -1e-9, `${key}: ${prev.id} overlaps ${sorted[i].id}`)
    }
  }
})

test('ids are unique across openings', () => {
  const ids = OPENINGS.map((o) => o.id)
  assert.deepEqual([...new Set(ids)], ids)
  assert.equal(Object.keys(OPENING_BY_ID).length, ids.length)
  assert.equal(DOORS.length + WINDOWS.length, OPENINGS.length)
})

test('the original living-room openings are preserved', () => {
  assert.ok(OPENING_BY_ID.entryDoor, 'entryDoor must still exist')
  assert.ok(OPENING_BY_ID.interiorDoor, 'interiorDoor must still exist')
  assert.ok(OPENING_BY_ID.livingWindow, 'the big west window must still exist')
  assert.equal(OPENING_BY_ID.entryDoor.line, 3)
  assert.equal(OPENING_BY_ID.interiorDoor.line, 4)
  assert.equal(OPENING_BY_ID.livingWindow.line, -4)
  assert.equal(OPENING_BY_ID.livingWindow.along, -0.7)
})

/* ---------------------------------------------------------- door leaves --- */

group('House layout: door leaves')

test('every door has exactly one leaf placement and one finish', () => {
  for (const door of DOORS) {
    assert.ok(DOOR_LEAF_PLACEMENT[door.id], `${door.id}: missing leaf placement`)
    assert.ok(DOOR_FINISH[door.id], `${door.id}: missing finish`)
  }
  assert.equal(Object.keys(DOOR_LEAF_PLACEMENT).length, DOORS.length)
})

test('each hinge sits on the door line at the correct end', () => {
  for (const door of DOORS) {
    const place = DOOR_LEAF_PLACEMENT[door.id]
    const [hx, hz] = place.hinge
    const half = door.width / 2
    if (door.axis === 'z') {
      assert.ok(near(hz, door.line), `${door.id}: hinge z ${hz} is off the wall ${door.line}`)
      assert.ok(near(hx, door.along + half), `${door.id}: hinge x ${hx} should be ${door.along + half}`)
      assert.ok(near(place.rotY, 0) || near(Math.abs(place.rotY), Math.PI * 2), `${door.id}: z-line doors use rotY 0`)
    } else {
      assert.ok(near(hx, door.line), `${door.id}: hinge x ${hx} is off the wall ${door.line}`)
      assert.ok(near(hz, door.along + half), `${door.id}: hinge z ${hz} should be ${door.along + half}`)
      assert.ok(near(place.rotY, -Math.PI / 2), `${door.id}: x-line doors use rotY -PI/2`)
    }
    assert.ok(Math.abs(place.openAngle) > 1 && Math.abs(place.openAngle) < 2, `${door.id}: implausible swing`)
  }
})

test('the closed leaf lies exactly across its opening', () => {
  for (const door of DOORS) {
    const place = DOOR_LEAF_PLACEMENT[door.id]
    const [hx, hz] = place.hinge
    // local -X maps to world direction for the stored rotY
    const dx = -Math.cos(place.rotY)
    const dz = Math.sin(place.rotY)
    const farX = hx + dx * door.width
    const farZ = hz + dz * door.width
    const lo = door.along - door.width / 2
    const hi = door.along + door.width / 2
    if (door.axis === 'z') {
      assert.ok(near(farX, lo), `${door.id}: leaf reaches ${farX}, opening starts at ${lo}`)
      assert.ok(near(farZ, door.line), `${door.id}: leaf left the wall`)
    } else {
      assert.ok(near(farZ, lo), `${door.id}: leaf reaches ${farZ}, opening starts at ${lo}`)
      assert.ok(near(farX, door.line), `${door.id}: leaf left the wall`)
    }
    void hi
  }
})

/* -------------------------------------------------------- furniture plan --- */

group('Furniture arrangement')

test('every seat faces the thing it was arranged around', () => {
  assert.ok(SEATING.length >= 3, 'expected at least the sofa and both dining chairs')
  for (const plan of SEATING) {
    const angle = seatOffScreenAngle(plan)
    assert.ok(
      angle <= plan.maxAngle,
      `${plan.id} (${plan.label}): seat looks ${angle.toFixed(1)}° off ${plan.focus.id}, max ${plan.maxAngle}°`,
    )
  }
})

test('the sofa faces the TV wall and the dining chairs face the table', () => {
  const sofa = SEATING.find((p) => p.id === 'living-sofa')
  assert.ok(sofa, 'the living-room sofa must be in the seating plan')
  assert.equal(sofa.focus.id, 'tv')
  const facing = seatFacing(sofa.seat)
  assert.ok(near(facing[0], 0, 1e-9) && near(facing[1], -1, 1e-9), `the sofa must look north, at the TV (got ${facing})`)

  const chairIds = SEATING.filter((p) => p.room === 'kitchen').map((p) => p.seat.id)
  assert.deepEqual(chairIds.sort(), DINING_TABLE.chairs.map((c) => c.id).sort())
})

test('seats and their focus sit inside their own room', () => {
  for (const plan of SEATING) {
    const seatRoom = getRoomAt(plan.seat.position[0], plan.seat.position[2])
    assert.ok(seatRoom, `${plan.id}: seat is outside the house`)
    assert.equal(seatRoom.id, plan.room, `${plan.id}: seat sits in ${seatRoom?.id}`)
    const focusRoom = getRoomAt(plan.focus.position[0], plan.focus.position[2])
    assert.ok(focusRoom, `${plan.id}: ${plan.focus.id} is outside the house`)
    assert.equal(focusRoom.id, plan.room, `${plan.id}: ${plan.focus.id} sits in ${focusRoom?.id}`)
  }
})

test('the dining table and its chairs are inside the kitchen', () => {
  const room = getRoomAt(DINING_TABLE.position[0], DINING_TABLE.position[2])
  assert.equal(room?.id, 'kitchen', 'the dining table must stand in the kitchen')
  for (const chair of DINING_TABLE.chairs) {
    const at = getRoomAt(chair.position[0], chair.position[2])
    assert.equal(at?.id, 'kitchen', `${chair.id} is not in the kitchen`)
  }
})

test('every camera preset has a plausible field of view', () => {
  for (const room of ROOM_LIST) {
    const fov = room.camera.fov ?? DEFAULT_FOV
    assert.ok(fov >= 30 && fov <= 75, `${room.id}: fov ${fov} is not usable`)
  }
  assert.ok(DEFAULT_FOV >= 30 && DEFAULT_FOV <= 75)
})

/* ------------------------------------------------------------- walking ---- */

group('Walkthrough collision')

const openAll = () => true
const openNone = () => false

test('you can move freely inside a single room', () => {
  assert.ok(walkPassable([0, 0], [1, 1], openNone))
  assert.ok(walkPassable([-3, -2], [3, 2], openNone))
  assert.ok(walkPassable([5, -5], [5.5, -5.5], openNone))
})

test('you cannot walk out of the house', () => {
  assert.ok(!walkPassable([0, 0], [20, 20], openNone))
  assert.ok(!walkPassable([8.5, 0], [12, 0], openNone))
  assert.ok(!walkPassable([0, -8.5], [0, -12], openNone))
})

test('a closed door blocks the doorway', () => {
  // living -> kitchen through interiorDoor (x = 4, along z = 1.2)
  assert.ok(!walkPassable([3.8, 1.2], [4.2, 1.2], openNone))
  // living -> hallway through entryDoor (z = 3, along x = 2.6)
  assert.ok(!walkPassable([2.6, 2.8], [2.6, 3.2], openNone))
})

test('an open door lets you through', () => {
  assert.ok(walkPassable([3.8, 1.2], [4.2, 1.2], openAll))
  assert.ok(walkPassable([2.6, 2.8], [2.6, 3.2], openAll))
  assert.ok(walkPassable([-2.6, -2.8], [-2.6, -3.2], openAll)) // bedroom door
  assert.ok(walkPassable([3.8, -6], [4.2, -6], openAll)) // en-suite door
})

test('you can only pass through the opening, not through the wall beside it', () => {
  // interiorDoor is at z = 1.2; z = 2.5 is solid wall on the same line
  assert.ok(!walkPassable([3.8, 2.5], [4.2, 2.5], openAll))
  // hallKitchenDoor is at x = 6.5; x = 5 is solid wall
  assert.ok(!walkPassable([5, 2.8], [5, 3.2], openAll))
})

test('diagonal movement is blocked when the crossing misses the doorway', () => {
  assert.ok(!walkPassable([3.0, 0.0], [4.5, 2.4], openAll))
  assert.ok(walkPassable([3.4, 0.9], [4.4, 1.4], openAll))
})

test('clampToHouse keeps positions inside the walkable box', () => {
  assert.deepEqual(clampToHouse(0, 0), [0, 0])
  const [x, z] = clampToHouse(100, -100)
  assert.equal(x, HOUSE_BOUNDS.maxX)
  assert.equal(z, HOUSE_BOUNDS.minZ)
  assert.ok(PLAYER_RADIUS > 0)
})

/* ------------------------------------------------------------- devices ---- */

group('Device catalogue')

const devices = createInitialDevices()
const deviceList = Object.values(devices)

test('every device carries the fields the UI and the AI facade rely on', () => {
  for (const device of deviceList) {
    assert.ok(device.id, 'device without an id')
    assert.ok(device.name, `${device.id}: missing name`)
    assert.ok(device.type, `${device.id}: missing type`)
    assert.ok(device.room, `${device.id}: missing room`)
    assert.ok(ROOMS[device.room], `${device.id}: unknown room ${device.room}`)
    assert.equal(typeof device.online, 'boolean', `${device.id}: online must be a boolean`)
  }
})

test('the catalogue key matches the device id', () => {
  for (const [key, device] of Object.entries(devices)) {
    assert.equal(key, device.id, `key ${key} points at ${device.id}`)
  }
})

test('every room has at least one device', () => {
  for (const room of ROOM_LIST) {
    const count = deviceList.filter((d) => d.room === room.id).length
    assert.ok(count > 0, `${room.id} has no devices`)
  }
})

test('every device type maps to a known group', () => {
  const groupIds = DEVICE_GROUPS.map((g) => g.id)
  for (const device of deviceList) {
    const gid = groupForDevice(device)
    assert.ok(groupIds.includes(gid), `${device.id}: group ${gid} is not in DEVICE_GROUPS`)
  }
})

test('every device renders a description and a primary action', () => {
  for (const device of deviceList) {
    const described = describeDevice(device, devices)
    assert.equal(typeof described, 'string')
    assert.ok(described.length > 0, `${device.id}: empty description`)
    assert.ok(getPrimaryAction(device).length > 0, `${device.id}: no primary action`)
  }
})

test('isDeviceOn agrees with the underlying state', () => {
  assert.equal(isDeviceOn({ type: 'light', power: true }), true)
  assert.equal(isDeviceOn({ type: 'light', power: false }), false)
  assert.equal(isDeviceOn({ type: 'door', open: true }), true)
  assert.equal(isDeviceOn({ type: 'curtains', open: false }), false)
  assert.equal(isDeviceOn({ type: 'lock', locked: true }), true)
  assert.equal(isDeviceOn({ type: 'doorbell', ringing: true }), true)
  assert.equal(isDeviceOn({ type: 'fridge', open: true }), true)
  assert.equal(isDeviceOn({ type: 'fridge', open: false, power: true }), false)
  assert.equal(isDeviceOn({ type: 'sensor', sensorKind: 'water', value: 'wet' }), true)
  assert.equal(isDeviceOn({ type: 'sensor', sensorKind: 'water', value: 'dry' }), false)
})

test('switches report "on" when any wired light is on', () => {
  const state = {
    ...devices,
    ceilingLightA: { ...devices.ceilingLightA, power: false },
    ceilingLightB: { ...devices.ceilingLightB, power: false },
  }
  const switchA = devices.switchA
  assert.equal(isDeviceOn(switchA, { ...state, [switchA.controls[0]]: { power: true } }), true)
  assert.equal(isDeviceOn(switchA, state), false)
})

test('all door devices correspond to a real architectural opening', () => {
  const doorDevices = deviceList.filter((d) => d.type === 'door' && d.id !== 'wardrobeDoor')
  for (const door of doorDevices) {
    assert.ok(OPENING_BY_ID[door.id], `door device ${door.id} has no opening`)
  }
  const doorOpenings = DOORS.map((d) => d.id)
  for (const id of doorOpenings) {
    assert.ok(devices[id], `opening ${id} has no device`)
  }
})

test('LIGHT_IDS lists exactly the light devices', () => {
  assert.ok(LIGHT_IDS.length >= 10)
  for (const id of LIGHT_IDS) {
    assert.equal(devices[id].type, 'light')
  }
  assert.equal(new Set(LIGHT_IDS).size, LIGHT_IDS.length)
})

/* -------------------------------------------------------------- sensors --- */

group('Sensors')

test('sensor states have a rest and an active reading', () => {
  for (const [kind, [rest, active]] of Object.entries(SENSOR_STATES)) {
    assert.ok(rest && active, `${kind}: needs two readings`)
    assert.notEqual(rest, active, `${kind}: readings must differ`)
  }
})

test('nextSensorValue toggles between the readings', () => {
  const water = { type: 'sensor', sensorKind: 'water', value: 'dry' }
  assert.equal(nextSensorValue(water), 'wet')
  assert.equal(nextSensorValue({ ...water, value: 'wet' }), 'dry')
  assert.equal(sensorActive({ ...water, value: 'wet' }), true)
  assert.equal(sensorActive(water), false)
})

test('every sensor device starts on a valid reading', () => {
  for (const device of deviceList.filter((d) => d.type === 'sensor')) {
    const states = SENSOR_STATES[device.sensorKind]
    assert.ok(states, `${device.id}: unknown sensor kind`)
    assert.ok(states.includes(device.value), `${device.id}: value ${device.value} is not in ${states}`)
  }
})

/* --------------------------------------------------------------- scenes --- */

group('Automation scenes')

test('the five household scenes are declared', () => {
  assert.deepEqual(MODE_LIST.map((m) => m.id).sort(), ['away', 'bedtime', 'home', 'morning', 'movie'])
  for (const mode of MODE_LIST) {
    assert.ok(mode.label && mode.hint, `${mode.id}: needs a label and hint`)
  }
})

test('every scene patch targets a real device and a real field', () => {
  for (const [modeId, patch] of Object.entries(MODE_PATCHES)) {
    assert.ok(patch && Object.keys(patch).length > 0, `${modeId}: empty patch`)
    for (const [deviceId, value] of Object.entries(patch)) {
      const device = devices[deviceId]
      assert.ok(device, `${modeId}: unknown device ${deviceId}`)
      for (const [field, v] of Object.entries(value)) {
        assert.ok(field in device, `${modeId}: ${deviceId} has no field "${field}"`)
        assert.notEqual(v, undefined, `${modeId}: ${deviceId}.${field} is undefined`)
      }
    }
  }
})

test('every scene is cross-room (each scene acts outside one room)', () => {
  for (const [modeId, patch] of Object.entries(MODE_PATCHES)) {
    const rooms = new Set(Object.keys(patch).map((id) => devices[id]?.room).filter(Boolean))
    assert.ok(rooms.size >= 2, `${modeId} only touches ${rooms.size} room(s)`)
  }
})

test('no scene unlocks the front door without locking it back', () => {
  for (const [modeId, patch] of Object.entries(MODE_PATCHES)) {
    if (patch.doorLock) {
      assert.notEqual(patch.doorLock.locked, false, `${modeId} must not unlock the front door`)
    }
  }
})

test('no scene powers down the fridge compressor', () => {
  for (const [modeId, patch] of Object.entries(MODE_PATCHES)) {
    if (patch.fridge) {
      assert.notEqual(patch.fridge.power, false, `${modeId} must not switch the fridge off`)
    }
  }
})

test('away mode closes every door and switches every light off', () => {
  const away = MODE_PATCHES.away
  for (const door of DOORS) {
    assert.ok(away[door.id], `away mode should set ${door.id}`)
    assert.equal(away[door.id].open, false, `away mode must close ${door.id}`)
  }
  for (const id of LIGHT_IDS) {
    assert.equal(away[id]?.power, false, `away mode must switch ${id} off`)
  }
  assert.equal(away.doorLock.locked, true)
})

test('movie mode starts the TV and closes the living-room curtains', () => {
  assert.equal(MODE_PATCHES.movie.tv.power, true)
  assert.equal(MODE_PATCHES.movie.curtains.open, false)
})

/* ---------------------------------------------------------------- props --- */

group('Interactive props')

const propDevices = deviceList.filter((d) => d.type === 'prop')

test('the small interactive props are present and grouped together', () => {
  const kinds = propDevices.map((d) => d.propKind).sort()
  assert.deepEqual(kinds, ['pepper', 'phone', 'remote', 'remote', 'utensils'])
  for (const prop of propDevices) {
    assert.equal(groupForDevice(prop), 'props', `${prop.id} should live in the props group`)
    assert.ok(DEVICE_GROUPS.some((g) => g.id === 'props'), 'DEVICE_GROUPS must declare the props group')
  }
})

test('every prop describes itself and offers a primary action', () => {
  for (const prop of propDevices) {
    const text = describeDevice(prop, devices)
    assert.ok(text.length > 0, `${prop.id}: empty description`)
    assert.ok(getPrimaryAction(prop).length > 0, `${prop.id}: no primary action`)
  }
})

test('a paired remote mirrors the device it controls', () => {
  const remote = devices.tvRemote
  assert.equal(remote.targets, 'tv')
  assert.equal(isDeviceOn(remote, devices), devices.tv.power)
  const tvOn = { ...devices, tv: { ...devices.tv, power: true } }
  assert.equal(isDeviceOn(remote, tvOn), true)

  const acRemote = devices.bedroomRemote
  assert.equal(acRemote.targets, 'bedroomAC')
  assert.equal(isDeviceOn(acRemote, devices), devices.bedroomAC.power)
})

test('a remote description follows its target state', () => {
  const remote = devices.tvRemote
  assert.match(describeDevice(remote, devices), /standby/)
  const tvOn = { ...devices, tv: { ...devices.tv, power: true } }
  assert.match(describeDevice(remote, tvOn), /TV on/)
  const muted = { ...devices, tv: { ...devices.tv, power: true, muted: true } }
  assert.match(describeDevice(remote, muted), /vol 0%/)

  const acOn = { ...devices, bedroomAC: { ...devices.bedroomAC, power: true, mode: 'heat', targetTemp: 21 } }
  assert.equal(isDeviceOn(devices.bedroomRemote, acOn), true)
  assert.match(describeDevice(devices.bedroomRemote, acOn), /Heating · 21/)
})

test('the phone reports its screen and charge state', () => {
  // The default phone has its screen lit so the vision model can spot it.
  assert.equal(devices.phone.propKind, 'phone')
  assert.equal(devices.phone.screen, true)
  const phone = { ...devices.phone, screen: false }
  assert.equal(isDeviceOn(phone), false)
  assert.match(describeDevice(phone, devices), /Screen off · charging/)
  const awake = { ...phone, screen: true, battery: 42 }
  assert.equal(isDeviceOn(awake), true)
  assert.equal(describeDevice(awake, devices), 'Screen on · 42%')
})

test('the pepper mill reports its fill level and grinds', () => {
  const mill = devices.pepperMill
  assert.equal(mill.propKind, 'pepper')
  assert.ok(mill.level > 0 && mill.level <= 1, 'the mill must start with a sensible fill')
  assert.equal(isDeviceOn(mill), false)
  assert.match(describeDevice(mill, devices), /full/)
  const grinding = { ...mill, grind: true, level: 0.8 }
  assert.equal(isDeviceOn(grinding), true)
  assert.match(describeDevice(grinding, devices), /Grinding/)
})

test('the utensil crock toggles in and out of use', () => {
  const crock = devices.utensilCrock
  assert.equal(crock.propKind, 'utensils')
  assert.equal(isDeviceOn(crock), false)
  assert.match(describeDevice(crock, devices), /4 utensils/)
  const inUse = { ...crock, inUse: true }
  assert.equal(isDeviceOn(inUse), true)
  assert.equal(describeDevice(inUse, devices), 'In use')
})

/* -------------------------------------------------------------- reports --- */

group('Energy and climate reporting')

test('every device draws a finite, non-negative load', () => {
  for (const device of deviceList) {
    const watts = devicePower(device)
    assert.ok(Number.isFinite(watts), `${device.id}: non-finite watts`)
    assert.ok(watts >= 0, `${device.id}: negative watts`)
  }
})

test('devicePower follows the device state', () => {
  assert.equal(devicePower(null), 0)
  assert.equal(devicePower({ type: 'light', power: false, brightness: 1 }), 0)
  assert.equal(devicePower({ type: 'light', power: true, brightness: 1 }), POWER_W.light)
  assert.equal(devicePower({ type: 'light', power: true, brightness: 0.5 }), Math.round(POWER_W.light * 0.5))
  assert.equal(devicePower({ type: 'tv', power: false }), POWER_W.tv.standby)
  assert.equal(devicePower({ type: 'tv', power: true, muted: false }), POWER_W.tv.on)
  assert.equal(devicePower({ type: 'tv', power: true, muted: true }), POWER_W.tv.muted)
  assert.equal(devicePower({ type: 'ac', power: true, mode: 'heat' }), POWER_W.ac.heat)
  assert.equal(devicePower({ type: 'ac', power: false, mode: 'heat' }), 0)
  assert.equal(devicePower({ type: 'fan', power: true, speed: 3 }), POWER_W.fan[3])
  assert.equal(devicePower({ type: 'fridge', power: true, open: true }), POWER_W.fridge.open)
  assert.equal(devicePower({ type: 'shower', power: true }), POWER_W.shower)
  assert.equal(
    devicePower({ type: 'cooker', power: true, heat: 2, ovenOn: true }),
    POWER_W.cooker.hobPerLevel * 2 + POWER_W.cooker.oven,
  )
  assert.equal(devicePower({ type: 'prop', propKind: 'phone', charging: true }), POWER_W.standby.phone)
  assert.equal(devicePower({ type: 'prop', propKind: 'phone', charging: false }), 0)
  assert.equal(devicePower({ type: 'door', open: true }), 0)
})

test('the house report sums the devices and splits them by room', () => {
  const report = houseEnergyReport(devices)
  const manual = deviceList.reduce((sum, d) => sum + devicePower(d), 0)
  assert.ok(near(report.totalWatts, manual, 1e-6), `total ${report.totalWatts} != ${manual}`)
  assert.equal(report.deviceCount, deviceList.length)
  assert.equal(report.activeCount, deviceList.filter((d) => devicePower(d) > 0).length)
  assert.equal(report.byRoom.length, ROOM_LIST.length)
  assert.deepEqual(report.byRoom.map((r) => r.id), ROOM_LIST.map((r) => r.id))
  assert.ok(near(report.byRoom.reduce((sum, r) => sum + r.watts, 0), manual, 1e-6), 'per-room watts must add up')
  assert.ok(near(report.costPerHour, (manual / 1000) * TARIFF.perKwh, 1e-9), 'cost per hour must follow the tariff')
  assert.equal(report.tariff, TARIFF)
})

test('the report ranks the biggest loads', () => {
  const report = houseEnergyReport(devices)
  assert.ok(report.top.length > 0 && report.top.length <= 5)
  assert.ok(report.top.every((t) => t.watts > 0))
  for (let i = 1; i < report.top.length; i += 1) {
    assert.ok(report.top[i - 1].watts >= report.top[i].watts, 'top loads must be sorted high to low')
  }
  for (const row of report.top) assert.ok(row.share > 0 && row.share <= 1, `${row.id}: share out of range`)
})

test('the report responds to device state', () => {
  const base = houseEnergyReport(devices)
  const brighter = houseEnergyReport({ ...devices, ceilingLightA: { ...devices.ceilingLightA, brightness: 1 } })
  assert.ok(brighter.totalWatts > base.totalWatts, 'raising a lamp brightness must raise the load')
  const heated = houseEnergyReport({ ...devices, ac: { ...devices.ac, mode: 'heat' } })
  assert.ok(heated.totalWatts > base.totalWatts, 'heating must draw more than cooling')
})

test('accumulateEnergy integrates load into kWh and tracks the peak', () => {
  const first = accumulateEnergy(null, 1000, 3600)
  assert.ok(near(first.kwhToday, 1, 1e-9), `expected 1 kWh, got ${first.kwhToday}`)
  assert.ok(near(first.peakWatts, 1000))
  const second = accumulateEnergy(first, 500, 1800) // another 0.25 kWh
  assert.ok(near(second.kwhToday, 1.25, 1e-9))
  assert.ok(near(second.peakWatts, 1000), 'the peak must hold the maximum seen')
  const spike = accumulateEnergy(second, 3000, 0)
  assert.ok(near(spike.peakWatts, 3000))
  assert.ok(near(spike.kwhToday, second.kwhToday), 'zero seconds adds no energy')
})

test('climate trends follow the active AC mode', () => {
  const base = { temp: 22, humidity: 45, ambientTemp: 20 }
  const cool = climateReport(base, devices) // the living-room AC starts on and cooling
  assert.equal(cool.mode, 'cool')
  assert.equal(cool.trend, 'Cooling')
  assert.equal(cool.cooling, true)
  assert.equal(cool.heating, false)
  assert.equal(cool.comfort, 'Comfortable')
  assert.equal(cool.target, 22)

  const heatDevices = {
    ...devices,
    ac: { ...devices.ac, power: false },
    bedroomAC: { ...devices.bedroomAC, power: true, mode: 'heat', targetTemp: 24 },
  }
  const heat = climateReport(base, heatDevices)
  assert.equal(heat.mode, 'heat')
  assert.equal(heat.trend, 'Warming')
  assert.equal(heat.heating, true)
  assert.equal(heat.running, 1)
  assert.equal(heat.target, 24)

  const dry = climateReport(base, { ...devices, ac: { ...devices.ac, mode: 'dry' } })
  assert.equal(dry.trend, 'Drying')

  const off = {
    ...devices,
    ac: { ...devices.ac, power: false },
    bedroomAC: { ...devices.bedroomAC, power: false },
  }
  const idle = climateReport({ temp: 19, humidity: 45, ambientTemp: 21 }, off)
  assert.equal(idle.running, 0)
  assert.equal(idle.mode, null)
  assert.equal(idle.trend, 'Warming') // below ambient, so drifting back up
  assert.equal(idle.comfort, 'Cool')
})

test('the report formatters read naturally', () => {
  assert.equal(formatWatts(0), '0 W')
  assert.equal(formatWatts(940), '940 W')
  assert.equal(formatWatts(1000), '1.0 kW')
  assert.equal(formatWatts(4200), '4.2 kW')
  assert.equal(formatKwh(0.423), '0.42 kWh')
  assert.equal(formatKwh(2.5), '2.5 kWh')
  assert.equal(formatKwh(1), '1.0 kWh')
  assert.ok(formatCost(1, TARIFF).startsWith(TARIFF.currency))
  assert.equal(formatCost(1, { currency: '£', perKwh: 1 }), '£1.00')
  assert.equal(formatCost(0.5, { currency: '$', perKwh: 0.2 }), '$0.100')
})

/* -------------------------------------------------- exterior / roof / plot -- */

group('Exterior, roof and compound')

test('the envelope is exactly the bounding rectangle of every room', () => {
  assert.equal(HOUSE_ENVELOPE.x0, Math.min(...ROOM_LIST.map((r) => r.x0)))
  assert.equal(HOUSE_ENVELOPE.x1, Math.max(...ROOM_LIST.map((r) => r.x1)))
  assert.equal(HOUSE_ENVELOPE.z0, Math.min(...ROOM_LIST.map((r) => r.z0)))
  assert.equal(HOUSE_ENVELOPE.z1, Math.max(...ROOM_LIST.map((r) => r.z1)))
})

test('every room sits inside the envelope', () => {
  for (const room of ROOM_LIST) {
    assert.ok(room.x0 >= HOUSE_ENVELOPE.x0 - 1e-9 && room.x1 <= HOUSE_ENVELOPE.x1 + 1e-9, `${room.id} escapes the envelope in x`)
    assert.ok(room.z0 >= HOUSE_ENVELOPE.z0 - 1e-9 && room.z1 <= HOUSE_ENVELOPE.z1 + 1e-9, `${room.id} escapes the envelope in z`)
  }
})

test('the skin has four outward-facing walls', () => {
  const walls = buildEnvelopeWalls(HOUSE_ENVELOPE, OPENINGS, { offset: EXTERIOR.skinOffset })
  assert.equal(walls.length, 4)
  const cx = (HOUSE_ENVELOPE.x0 + HOUSE_ENVELOPE.x1) / 2
  const cz = (HOUSE_ENVELOPE.z0 + HOUSE_ENVELOPE.z1) / 2
  for (const wall of walls) {
    const r = wall.rotation[1]
    const nx = Math.sin(r)
    const nz = Math.cos(r)
    const ox = wall.center[0] - cx
    const oz = wall.center[1] - cz
    assert.ok(nx * ox + nz * oz > 0, `the skin wall at ${wall.center} does not face outward`)
  }
})

test('the skin is offset clear of the interior wall plane', () => {
  const walls = buildEnvelopeWalls(HOUSE_ENVELOPE, OPENINGS, { offset: EXTERIOR.skinOffset })
  for (const wall of walls) {
    const gap = wall.axis === 'z'
      ? Math.abs(wall.center[1] - wall.line)
      : Math.abs(wall.center[0] - wall.line)
    assert.ok(near(gap, EXTERIOR.skinOffset, 1e-9), `skin wall sits ${gap} off its plane, expected ${EXTERIOR.skinOffset}`)
  }
})

test('every envelope opening is cut through the skin', () => {
  const walls = buildEnvelopeWalls(HOUSE_ENVELOPE, OPENINGS, { offset: EXTERIOR.skinOffset })
  let cut = 0
  for (const opening of OPENINGS) {
    const wall = walls.find((w) => w.axis === opening.axis && near(w.line, opening.line))
    if (!wall) continue // an interior opening, not on the outer skin
    cut += 1
    const hole = wall.holes.find((h) => near(h.w, opening.width) && near(h.h, opening.y1 - opening.y0))
    assert.ok(hole, `${opening.id} is not cut through the envelope skin`)
  }
  assert.ok(cut >= 8, `expected the outer openings to be cut, only found ${cut}`)
})

test('all four skin walls carry window or door holes', () => {
  const walls = buildEnvelopeWalls(HOUSE_ENVELOPE, OPENINGS, { offset: EXTERIOR.skinOffset })
  for (const wall of walls) {
    assert.ok(wall.holes.length > 0, `skin wall at ${wall.line} has no openings`)
  }
})

test('the compound plot encloses the house', () => {
  const plot = EXTERIOR.compound.plot
  assert.ok(plot.x0 < HOUSE_ENVELOPE.x0 && plot.x1 > HOUSE_ENVELOPE.x1, 'the plot must surround the house in x')
  assert.ok(plot.z0 < HOUSE_ENVELOPE.z0 && plot.z1 > HOUSE_ENVELOPE.z1, 'the plot must surround the house in z')
  assert.ok(EXTERIOR.compound.boundary.height > 0)
  assert.ok(EXTERIOR.compound.boundary.thickness > 0)
})

test('the front boundary has a plain gateless opening', () => {
  const opening = EXTERIOR.compound.opening
  assert.ok(opening, 'expected a boundary opening')
  assert.equal(opening.line, EXTERIOR.compound.plot.z1, 'the gap should sit in the front boundary')
  assert.ok(opening.width > 1 && opening.width < 4)
  assert.ok(EXTERIOR.compound.path.z1 >= opening.line - 1e-9, 'the path should reach the boundary')
})

test('there is no gate and no car anywhere in the model', () => {
  const forbidden = ['gate', 'car', 'garage', 'driveway', 'vehicle']
  const haystack = [
    JSON.stringify(EXTERIOR),
    JSON.stringify(ROOF),
    JSON.stringify(HOUSE_ENVELOPE),
    ...deviceList.map((d) => `${d.id} ${d.name}`),
  ].join(' ').toLowerCase()
  for (const word of forbidden) {
    assert.ok(!new RegExp(`\\b${word}\\b`).test(haystack), `found a forbidden "${word}" in the model`)
  }
})

test('the roof has a parapet and an eave overhanging the wall', () => {
  assert.ok(ROOF.parapet.height > 0 && ROOF.parapet.thickness > 0)
  assert.ok(ROOF.eave.overhang > 0)
  assert.ok(ROOF.eave.y > 0 && ROOF.eave.y < HOUSE_HEIGHT + 1)
})

test('rooftop equipment has unique ids and stays over the building', () => {
  const ids = ROOF.equipment.map((e) => e.id)
  assert.deepEqual([...new Set(ids)], ids, 'equipment ids must be unique')
  assert.ok(ids.length >= 4)
  for (const item of ROOF.equipment) {
    assert.ok(item.kind, `${item.id}: missing kind`)
    const [x, y, z] = item.position
    assert.ok(x >= HOUSE_ENVELOPE.x0 - 1e-9 && x <= HOUSE_ENVELOPE.x1 + 1e-9, `${item.id} is off the building in x`)
    assert.ok(z >= HOUSE_ENVELOPE.z0 - 1e-9 && z <= HOUSE_ENVELOPE.z1 + 1e-9, `${item.id} is off the building in z`)
    assert.ok(y >= HOUSE_HEIGHT - 0.1, `${item.id} should sit on the roof`)
  }
})

/* ---------------------------------------------------- room view framing --- */

group('Room viewpoints')

test('every room has at least a default view and a whole-room view', () => {
  for (const room of ROOM_LIST) {
    assert.ok(Array.isArray(room.views) && room.views.length >= 2, `${room.id}: needs multiple viewpoints`)
    assert.deepEqual(room.views[0].position, room.camera.position, `${room.id}: views[0] must start at the default camera`)
    assert.deepEqual(room.views[0].target, room.camera.target, `${room.id}: views[0] must look where the default camera looks`)
    assert.ok(room.views.some((v) => v.wide), `${room.id}: needs a 'wide' whole-room view`)
  }
})

test('every viewpoint is well-formed and sits inside its room', () => {
  for (const room of ROOM_LIST) {
    for (const view of room.views) {
      assert.ok(view.label && view.label.length > 0, `${room.id}: viewpoint needs a label`)
      for (const key of ['position', 'target']) {
        assert.equal(view[key].length, 3, `${room.id}/${view.label}: ${key} must be xyz`)
        assert.ok(view[key].every((n) => Number.isFinite(n)), `${room.id}/${view.label}: ${key} has a bad number`)
      }
      const [x, , z] = view.position
      assert.ok(x > room.x0 && x < room.x1, `${room.id}/${view.label}: camera x ${x} is outside the room`)
      assert.ok(z > room.z0 && z < room.z1, `${room.id}/${view.label}: camera z ${z} is outside the room`)
      assert.ok(view.position[1] > 0.4 && view.position[1] < 2.75, `${room.id}/${view.label}: camera height is unreasonable`)
      if (view.fov !== undefined) assert.ok(view.fov > 20 && view.fov < 90, `${room.id}/${view.label}: fov ${view.fov} is unreasonable`)
    }
  }
})

test('a wide viewpoint sees more of the room than the corner view', () => {
  for (const room of ROOM_LIST) {
    const corner = room.views[0]
    const wide = room.views.find((v) => v.wide)
    assert.ok((wide.fov ?? DEFAULT_FOV) >= (corner.fov ?? DEFAULT_FOV), `${room.id}: the whole-room view should not be narrower`)
  }
})

test('roomViewPreset wraps and falls back safely', () => {
  for (const room of ROOM_LIST) {
    assert.equal(roomViewCount(room.id), room.views.length)
    assert.deepEqual(roomViewPreset(room.id, 0), room.views[0])
    assert.deepEqual(roomViewPreset(room.id, room.views.length), room.views[0], `${room.id}: index should wrap`)
    assert.deepEqual(roomViewPreset(room.id, -1), room.views[room.views.length - 1], `${room.id}: negative index should wrap`)
    assert.deepEqual(roomViewPreset('does-not-exist', 0), ROOMS.living.views[0], 'unknown room should fall back to the living room')
  }
})

/* ------------------------------------------------------- fridge-freezer --- */

group('Fridge-freezer doors')

test('the fridge exposes two independent doors', () => {
  assert.equal(typeof devices.fridge.open, 'boolean')
  assert.equal(typeof devices.fridge.freezerOpen, 'boolean')
})

test('isDeviceOn sees the fridge as active when either door is open', () => {
  assert.equal(isDeviceOn({ type: 'fridge', open: true, freezerOpen: false }), true)
  assert.equal(isDeviceOn({ type: 'fridge', open: false, freezerOpen: true }), true)
  assert.equal(isDeviceOn({ type: 'fridge', open: false, freezerOpen: false, power: true }), false)
})

test('the fridge draws the door-open load for either door', () => {
  assert.equal(devicePower({ type: 'fridge', power: true, open: true, freezerOpen: false }), POWER_W.fridge.open)
  assert.equal(devicePower({ type: 'fridge', power: true, open: false, freezerOpen: true }), POWER_W.fridge.open)
  assert.equal(devicePower({ type: 'fridge', power: true, open: false, freezerOpen: false }), POWER_W.fridge.running)
})

test('the fridge description names whichever door is open', () => {
  assert.match(describeDevice({ type: 'fridge', open: true, freezerOpen: false, power: true, targetTemp: 3 }, devices), /fridge open/)
  assert.match(describeDevice({ type: 'fridge', open: false, freezerOpen: true, power: true, targetTemp: 3 }, devices), /freezer open/)
  assert.match(describeDevice({ type: 'fridge', open: true, freezerOpen: true, power: true, targetTemp: 3 }, devices), /fridge open · freezer open/)
  assert.match(describeDevice({ type: 'fridge', open: false, freezerOpen: false, power: true, targetTemp: 3 }, devices), /Cooling/)
})

test('no scene leaves a fridge door open', () => {
  for (const [modeId, patch] of Object.entries(MODE_PATCHES)) {
    if (patch.fridge?.open === false || patch.fridge?.freezerOpen === false) {
      assert.notEqual(patch.fridge.open, true, `${modeId} must not open the fridge`)
      assert.notEqual(patch.fridge.freezerOpen, true, `${modeId} must not open the freezer`)
    }
  }
})

/* --------------------------------------------------------- Alexa brain --- */

group('Alexa assistant: the command brain')

const alexaState = () => ({
  devices: createInitialDevices(),
  room: { temp: 24.5, humidity: 46 },
  currentRoom: 'living',
  activeMode: 'Manual',
})
const commits = (plan) => plan.actions.filter((a) => a.kind === 'commit')

test('imperative commands hit exactly the devices they name', () => {
  const plan = parseCommand('turn off the kitchen light', alexaState())
  assert.equal(plan.intent, 'command')
  assert.deepEqual(commits(plan).map((a) => a.id).sort(), ['kitchenLight', 'kitchenStrip'])
  assert.ok(commits(plan).every((a) => a.patch.power === false))
})

test('a named device never re-expands into its whole class', () => {
  const plan = parseCommand('dim the table lamp', alexaState())
  assert.deepEqual(commits(plan).map((a) => a.id), ['tableLamp'])
})

test('a room scope reaches every light in that room and no others', () => {
  const plan = parseCommand('turn on the bedroom lights', alexaState())
  assert.deepEqual(commits(plan).map((a) => a.id).sort(), ['bedLampLeft', 'bedLampRight', 'bedroomLight'])
  // A bare room with an on/off verb means that room's lights.
  const bare = parseCommand('turn on the kitchen', alexaState())
  assert.ok(commits(bare).every((a) => a.id.startsWith('kitchen')))
})

test('whole-house commands respect the safety exclusions', () => {
  const ids = commits(parseCommand('turn off everything in the house', alexaState())).map((a) => a.id)
  assert.ok(ids.includes('tv') && ids.includes('ceilingLightA'))
  assert.ok(!ids.includes('fridge'), 'the fridge must never be powered down')
  assert.ok(!ids.includes('doorLock'), 'the lock stays under user control')
  assert.ok(!ids.includes('mainDoor'), 'doors are not power devices')
})

test('numeric set commands reach the right attribute', () => {
  assert.equal(commits(parseCommand('set the ac to 20 degrees', alexaState()))[0].patch.targetTemp, 20)
  assert.equal(commits(parseCommand('volume 30', alexaState()))[0].patch.volume, 30)
  assert.equal(commits(parseCommand('channel 5', alexaState()))[0].patch.channel, 5)
  assert.equal(commits(parseCommand('fan speed 3', alexaState()))[0].patch.speed, 3)
  assert.equal(commits(parseCommand('set the shower to 40 degrees', alexaState()))[0].patch.temp, 40)
})

test('brightness patches stay free of float noise', () => {
  const b = commits(parseCommand('dim the table lamp', alexaState()))[0].patch.brightness
  assert.equal(b, Math.round(b * 100) / 100)
})

test('scenes, navigation and lock verbs map to the right actions', () => {
  assert.equal(parseCommand('movie mode', alexaState()).actions[0].modeId, 'movie')
  assert.equal(parseCommand('good night', alexaState()).actions[0].modeId, 'bedtime')
  assert.equal(parseCommand('i am leaving', alexaState()).actions[0].modeId, 'away')
  assert.deepEqual(parseCommand('go to the kitchen', alexaState()).actions[0], { kind: 'nav', roomId: 'kitchen' })
  const lock = commits(parseCommand('lock the front door', alexaState()))[0]
  assert.equal(lock.id, 'doorLock')
  assert.equal(lock.patch.locked, true)
})

test('open / close reach covers, doors and the fridge', () => {
  assert.ok(commits(parseCommand('open the curtains', alexaState())).every((a) => a.patch.open === true))
  assert.equal(commits(parseCommand('open the freezer', alexaState()))[0].patch.freezerOpen, true)
})

test('questions answer with state instead of toggling anything', () => {
  const plan = parseCommand('is the tv on', alexaState())
  assert.equal(plan.actions.length, 0)
  assert.equal(plan.intent, 'question')
  assert.match(plan.reply, /Standby/)
  assert.equal(parseCommand("what's on", alexaState()).intent, 'status')
  assert.equal(parseCommand('how hot is it', alexaState()).intent, 'climate')
})

test('the wake word prefix is stripped before parsing', () => {
  const plan = parseCommand('ok alexa turn off the kitchen light', alexaState())
  assert.equal(plan.intent, 'command')
  assert.deepEqual(commits(plan).map((a) => a.id).sort(), ['kitchenLight', 'kitchenStrip'])
})

test('nonsense falls back to a helpful apology', () => {
  const plan = parseCommand('asdkjhaskdjh', alexaState())
  assert.equal(plan.actions.length, 0)
  assert.equal(plan.intent, 'unknown')
  assert.match(plan.reply, /Try/)
})

test('greetings get a greeting, not an apology', () => {
  for (const hi of ['hi', 'hello', 'hey alexa', 'hi alexa', 'ok alexa']) {
    const plan = parseCommand(hi, alexaState())
    assert.equal(plan.intent, 'greeting', `"${hi}" should greet`)
    assert.equal(plan.actions.length, 0)
  }
})

test('big batch replies stay short instead of listing every device', () => {
  const plan = parseCommand('turn off everything', alexaState())
  assert.ok(commits(plan).length > 3, 'the batch really is big')
  assert.ok(plan.reply.length < 60, `reply too long: ${plan.reply}`)
  assert.match(plan.reply, /all \d+ are off/)
  // Small commands still name their devices.
  assert.match(parseCommand('turn off the table lamp', alexaState()).reply, /Table Lamp/)
})

test('reports round their numbers and stay compact', () => {
  const state = alexaState()
  state.room = { temp: 22.4321, humidity: 45.079 }
  const reply = parseCommand("what's on", state).reply
  assert.ok(!/\d+\.\d{3,}/.test(reply), `float noise leaked into: ${reply}`)
  assert.ok(reply.length < 140, `report too long: ${reply}`)
})

/* --------------------------------------------------------------- report --- */

console.log(`\n${'-'.repeat(52)}`)
if (failed === 0) {
  console.log(`All ${passed} checks passed.`)
} else {
  console.log(`${passed} passed, ${failed} failed:`)
  for (const { name, error } of failures) {
    console.log(`\n  ${name}\n    ${error.message}`)
  }
}
process.exit(failed === 0 ? 0 : 1)
