/**
 * Pure architectural definition of the whole house.
 *
 * The living room keeps the exact footprint of the original single-room
 * simulator (x:[-4,4], z:[-3,3]) so all of its furniture, the big west window,
 * the TV and every appliance stay exactly where they were. Every other room is
 * arranged around it and connected through shared door openings.
 *
 *   x = east, z = south, y = up.
 *
 * This module has no THREE / React import, so the same numbers drive the 3D
 * shell, the camera navigation, the 2D floor plan and the automated tests.
 */

export const HOUSE_HEIGHT = 3

/* ------------------------------------------------------------------ rooms -- */

/** @type {Array} Ordered list - drives the navigation panel and the floor plan. */
export const ROOM_LIST = [
  {
    id: 'living',
    label: 'Living Room',
    short: 'Living',
    x0: -4, x1: 4, z0: -3, z1: 3,
    floor: 'wood',
    accent: 'slat',
    /* every camera preset sits *inside* its room: the surrounding walls are
       single sided, so from outside the hall you would only see the hall's own
       north wall instead of the living room.
       The living room is the one room whose hero objects (the TV on the north
       wall and the sofa on the south wall) are too far apart for the default
       field of view, so its preset is a wider shot from the south-east corner
       that frames both - and shows the sofa *facing* the screen. */
    camera: { position: [3.6, 2.0, 2.6], target: [-2.2, 1.0, -1.6], fov: 52 },
    /* Extra framings so every side of the room can be reached in one click
       instead of orbiting the camera out through the rest of the house. */
    views: [
      { label: 'Corner', position: [3.6, 2.0, 2.6], target: [-2.2, 1.0, -1.6], fov: 52 },
      { label: 'Whole room', wide: true, position: [3.4, 2.7, 2.85], target: [-0.2, 0.75, -0.1], fov: 70 },
      { label: 'From the TV', position: [-1.6, 2.0, -2.5], target: [1.2, 0.7, 2.4], fov: 62 },
    ],
    spawn: [-1.2, 1.2],
  },
  {
    id: 'bedroom',
    label: 'Bedroom',
    short: 'Bedroom',
    x0: -4, x1: 4, z0: -9, z1: -3,
    floor: 'carpet',
    camera: { position: [-1.4, 1.8, -4.3], target: [2.0, 0.7, -7.6] },
    views: [
      { label: 'Corner', position: [-1.4, 1.8, -4.3], target: [2.0, 0.7, -7.6], fov: 46 },
      { label: 'Whole room', wide: true, position: [-3.0, 2.7, -3.9], target: [0.6, 0.6, -6.8], fov: 70 },
      { label: 'Bedside', position: [1.0, 1.7, -4.4], target: [2.4, 0.55, -8.2], fov: 60 },
    ],
    spawn: [-1.4, -4.0],
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    short: 'Kitchen',
    x0: 4, x1: 9, z0: -3, z1: 3,
    floor: 'tile',
    camera: { position: [5.0, 1.8, 2.3], target: [7.4, 1.05, -1.2] },
    views: [
      { label: 'Corner', position: [5.0, 1.8, 2.3], target: [7.4, 1.05, -1.2], fov: 46 },
      { label: 'Whole room', wide: true, position: [4.7, 2.6, 2.7], target: [6.7, 0.7, 0.0], fov: 72 },
      { label: 'From the dining nook', position: [8.0, 1.95, -2.4], target: [5.3, 0.8, 1.5], fov: 62 },
    ],
    spawn: [6.6, 1.8],
  },
  {
    id: 'bathroom',
    label: 'Bathroom',
    short: 'Bath',
    x0: 4, x1: 9, z0: -9, z1: -3,
    floor: 'tile',
    camera: { position: [7.9, 1.85, -6.6], target: [5.2, 1.0, -3.2] },
    views: [
      { label: 'Corner', position: [7.9, 1.85, -6.6], target: [5.2, 1.0, -3.2], fov: 46 },
      { label: 'Whole room', wide: true, position: [8.4, 2.7, -3.7], target: [6.0, 0.6, -6.6], fov: 72 },
      { label: 'From the shower', position: [5.0, 2.0, -4.1], target: [7.7, 0.7, -7.7], fov: 62 },
    ],
    spawn: [5.2, -4.2],
  },
  {
    id: 'hallway',
    label: 'Entrance Hall',
    short: 'Hall',
    x0: -4, x1: 9, z0: 3, z1: 5.5,
    floor: 'wood',
    camera: { position: [-2.2, 1.85, 4.4], target: [4.5, 1.3, 4.6] },
    views: [
      { label: 'Along the hall', position: [-2.2, 1.85, 4.4], target: [4.5, 1.3, 4.6], fov: 46 },
      { label: 'Whole room', wide: true, position: [-3.3, 2.5, 4.0], target: [3.0, 0.9, 4.9], fov: 74 },
      { label: 'From the front door', position: [4.6, 2.0, 5.05], target: [-1.2, 0.85, 3.95], fov: 66 },
    ],
    spawn: [2.5, 4.2],
  },
]

export const ROOMS = Object.fromEntries(ROOM_LIST.map((r) => [r.id, r]))

/**
 * Camera framing N for a room. Each room lists a small set of viewpoints so the
 * user can look at a different side of the room with one click instead of
 * orbiting the camera out through its neighbours. `views[0]` is always the
 * room's default `camera`, and the modulo keeps the index in range.
 */
export function roomViewPreset(roomId, index = 0) {
  const room = ROOMS[roomId] || ROOMS.living
  const views = room.views && room.views.length ? room.views : [room.camera]
  return views[((index % views.length) + views.length) % views.length]
}

/** How many viewpoints a room offers (always at least one). */
export function roomViewCount(roomId) {
  const room = ROOMS[roomId] || ROOMS.living
  return room.views && room.views.length ? room.views.length : 1
}

/** The field of view every camera preset uses unless it asks for its own. */
export const DEFAULT_FOV = 46

/* --------------------------------------------------------- kitchen dining -- */
/*
 * The kitchen nook: the table's world anchor plus one entry per chair. The
 * chairs are stored in world space (not as local offsets) so the seating plan
 * above can check that each one actually faces the table, and the 3D component
 * converts them back to local offsets from `position`.
 */
export const DINING_TABLE = {
  id: 'diningTable',
  room: 'kitchen',
  /* ground anchor of the table group (the table top sits 0.74 above it) */
  position: [6.7, 0, 0.7],
  topY: 0.74,
  /* world-space chair anchors, each rotationY chosen so local +Z looks at the table */
  chairs: [
    { id: 'diningChairWest', position: [5.75, 0, 0.8], rotationY: Math.PI / 2 },
    { id: 'diningChairEast', position: [7.65, 0, 0.6], rotationY: -Math.PI / 2 },
  ],
}

/* ------------------------------------------------------------ seating plan -- */
/*
 * The one piece of interior geometry that carries *meaning*: a seat has to face
 * whatever it was arranged around (a TV, a dining table). It is described here,
 * outside the JSX, so the arrangement can be verified instead of eyeballed -
 * exactly the bug the user reported ("the chair is facing backward").
 *
 *   localFacing  the direction the seat looks along in its own local space
 *                (furniture/Sofa.jsx builds the seat facing local +Z)
 *   rotationY    the Y rotation applied to the seat
 *   focus        the world position the seat must be looking at
 */
export const SEATING = [
  {
    id: 'living-sofa',
    room: 'living',
    label: 'Sofa',
    focus: { id: 'tv', position: [0, 1.7, -2.95] },
    seat: { id: 'sofa', position: [0, 0, 2.0], rotationY: Math.PI, localFacing: [0, 0, 1] },
    maxAngle: 10,
  },
  {
    id: 'kitchen-chair-west',
    room: 'kitchen',
    label: 'Dining chair (west)',
    focus: { id: 'diningTable', position: DINING_TABLE.position },
    seat: { id: 'diningChairWest', position: DINING_TABLE.chairs[0].position, rotationY: DINING_TABLE.chairs[0].rotationY, localFacing: [0, 0, 1] },
    maxAngle: 10,
  },
  {
    id: 'kitchen-chair-east',
    room: 'kitchen',
    label: 'Dining chair (east)',
    focus: { id: 'diningTable', position: DINING_TABLE.position },
    seat: { id: 'diningChairEast', position: DINING_TABLE.chairs[1].position, rotationY: DINING_TABLE.chairs[1].rotationY, localFacing: [0, 0, 1] },
    maxAngle: 10,
  },
]

export const SEAT_PLAN = Object.fromEntries(SEATING.map((p) => [p.room, p]))

/** World-space unit direction a seat looks along (three.js Y-rotation maths). */
export function seatFacing(seat) {
  // localFacing is a world-style triple; only the x/z components rotate here.
  const lx = seat.localFacing[0] ?? 0
  const lz = seat.localFacing[2] ?? 0
  const c = Math.cos(seat.rotationY)
  const s = Math.sin(seat.rotationY)
  const dx = lx * c + lz * s
  const dz = -lx * s + lz * c
  const len = Math.hypot(dx, dz) || 1
  return [dx / len, dz / len]
}

/** How far (in degrees) a seat's gaze misses the focus it is arranged around. */
export function seatOffScreenAngle(plan) {
  const [sx, , sz] = plan.seat.position
  const [tx, , tz] = plan.focus.position
  const [fx, fz] = seatFacing(plan.seat)
  const dx = tx - sx
  const dz = tz - sz
  const len = Math.hypot(dx, dz) || 1
  const dot = (dx / len) * fx + (dz / len) * fz
  return (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI
}

/** Camera presets that are not tied to a single room. */
export const OVERVIEW_CAMERA = { position: [2.5, 16, 17], target: [2.5, 0, -1.75] }
export const FLOORPLAN_CAMERA = { position: [2.5, 24, -1.0], target: [2.5, 0, -1.75] }

export const roomCenter = (room) => [(room.x0 + room.x1) / 2, HOUSE_HEIGHT * 0.42, (room.z0 + room.z1) / 2]
export const roomWidth = (room) => room.x1 - room.x0
export const roomDepth = (room) => room.z1 - room.z0
export const roomArea = (room) => roomWidth(room) * roomDepth(room)

/** The room containing a world-space point, or null. */
export function getRoomAt(x, z) {
  return ROOM_LIST.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) || null
}

/** Used by the tests: two rooms must never overlap. */
export function roomsOverlap(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0
}

/* ------------------------------------------------------------- openings --- */
/*
 * Every wall opening (door or window) is described once, in world space. An
 * opening lives on a wall line:
 *
 *   axis 'z' -> a horizontal wall at z = `line`, `along` is the x centre.
 *   axis 'x' -> a vertical wall   at x = `line`, `along` is the z centre.
 *
 * The shell attaches each opening to *every* room edge that lies on its line,
 * so a doorway between two rooms is cut out of both single-sided walls and you
 * can see straight through it.
 */

export const DOOR_HEIGHT = 2.1

const door = (id, axis, line, along, width = 0.95, height = DOOR_HEIGHT) => ({
  kind: 'door', id, axis, line, along, width, y0: 0, y1: height,
})
const window_ = (id, axis, line, along, width, y0, y1) => ({
  kind: 'window', id, axis, line, along, width, y0, y1,
})

export const OPENINGS = [
  /* ---- living room: north bedroom door, south hall door, east kitchen door */
  // NOTE: entryDoor / interiorDoor keep their original device IDs so the
  // original living-room interactions and state carry over unchanged.
  door('bedroomDoor', 'z', -3, -2.6),
  door('entryDoor', 'z', 3, 2.6),
  door('interiorDoor', 'x', 4, 1.2),
  window_('livingWindow', 'x', -4, -0.7, 2.4, 0.9, 2.4),

  /* ---- bedroom: window + a door through to the bathroom ----------------- */
  window_('bedroomWindow', 'z', -9, 0, 2.2, 0.95, 2.4),
  window_('bedroomWindowW', 'x', -4, -6, 1.5, 1.05, 2.35),

  /* ---- kitchen: hall door, bathroom door, east window ------------------ */
  door('hallKitchenDoor', 'z', 3, 6.5),
  door('bathDoorKitchen', 'z', -3, 6.5, 0.85),
  window_('kitchenWindowE', 'x', 9, 0, 1.8, 1.15, 2.35),

  /* ---- bathroom: door to the bedroom + frosted windows ----------------- */
  door('bathDoorBedroom', 'x', 4, -6, 0.85),
  window_('bathroomWindowN', 'z', -9, 6.5, 1.1, 1.5, 2.4),
  window_('bathroomWindowE', 'x', 9, -6, 0.9, 1.5, 2.4),

  /* ---- hallway: main entrance, sidelight, side windows ----------------- */
  door('mainDoor', 'z', 5.5, 2.6, 1.15, 2.25),
  window_('hallWindowS', 'z', 5.5, 4.6, 0.7, 0.9, 2.2),
  window_('hallWindowW', 'x', -4, 4.25, 1.2, 1.0, 2.3),
  window_('hallWindowE', 'x', 9, 4.25, 1.2, 1.0, 2.3),
]

export const OPENING_BY_ID = Object.fromEntries(OPENINGS.map((o) => [o.id, o]))

export const DOORS = OPENINGS.filter((o) => o.kind === 'door')
export const WINDOWS = OPENINGS.filter((o) => o.kind === 'window')

/**
 * The four edges of a room, ordered so the single-sided wall faces inward
 * (see `wallFrame` in three/helpers/walls.js). `openings` are filled in by the
 * shell; this helper is pure and reused by the floor plan.
 */
export function roomEdges(room) {
  return [
    { axis: 'z', line: room.z0, from: room.x0, to: room.x1, side: 'north' },
    { axis: 'z', line: room.z1, from: room.x1, to: room.x0, side: 'south' },
    { axis: 'x', line: room.x0, from: room.z1, to: room.z0, side: 'west' },
    { axis: 'x', line: room.x1, from: room.z0, to: room.z1, side: 'east' },
  ]
}

/**
 * True when `opening` is cut into one of `room`'s four edges, i.e. its joinery
 * (frame, glazing, door leaf) visually belongs to that room.
 *
 * The isolated room view shows one room on its own, so it needs to hide the
 * windows and doors that belong to the rooms it is not drawing; this is the
 * test it uses. A doorway shared by two rooms legitimately reports true for
 * both, which is why both the room panel and the leaf stay put.
 */
export function openingServesRoom(opening, room) {
  const tol = 1e-6
  const axis = opening.axis
  const onEdgeLine = axis === 'z'
    ? (Math.abs(opening.line - room.z0) < tol || Math.abs(opening.line - room.z1) < tol)
    : (Math.abs(opening.line - room.x0) < tol || Math.abs(opening.line - room.x1) < tol)
  if (!onEdgeLine) return false
  const lo = axis === 'z' ? Math.min(room.x0, room.x1) : Math.min(room.z0, room.z1)
  const hi = axis === 'z' ? Math.max(room.x0, room.x1) : Math.max(room.z0, room.z1)
  return opening.along + opening.width / 2 > lo + tol && opening.along - opening.width / 2 < hi - tol
}

/**
 * Door leaf placement: hinge point in the world plus the Y rotation that lays
 * the leaf flat inside its wall and the angle it swings to when open.
 *
 * The Door component hinges at the group origin and extends the panel toward
 * local -X, so:
 *   - a horizontal wall (axis 'z') uses rotY 0 with the hinge at the *higher*
 *     x end, so the panel spans back across the opening;
 *   - a vertical wall (axis 'x') uses rotY -PI/2 with the hinge at the higher
 *     z end.
 * `openAngle` is chosen so each leaf swings into a room rather than through a
 * wall: -1.6 for the z-line doors, +1.6 for the x-line doors.
 */
export const DOOR_LEAF_PLACEMENT = {
  bedroomDoor: { hinge: [-2.125, -3], rotY: 0, openAngle: -1.6 },
  entryDoor: { hinge: [3.075, 3], rotY: 0, openAngle: -1.6 },
  interiorDoor: { hinge: [4, 1.675], rotY: -Math.PI / 2, openAngle: 1.6 },
  hallKitchenDoor: { hinge: [6.975, 3], rotY: 0, openAngle: -1.6 },
  bathDoorKitchen: { hinge: [6.925, -3], rotY: 0, openAngle: -1.6 },
  bathDoorBedroom: { hinge: [4, -5.575], rotY: -Math.PI / 2, openAngle: 1.6 },
  mainDoor: { hinge: [3.175, 5.5], rotY: 0, openAngle: -1.6 },
}

export const DOOR_FINISH = {
  bedroomDoor: { panelColor: '#7a5637', trimColor: '#f3efe8' },
  entryDoor: { panelColor: '#7a5637', trimColor: '#f3efe8' },
  interiorDoor: { panelColor: '#c9b79c', trimColor: '#efe7da', frameDepth: -0.04 },
  hallKitchenDoor: { panelColor: '#c9b79c', trimColor: '#efe7da' },
  bathDoorKitchen: { panelColor: '#e7ddce', trimColor: '#f3efe8' },
  bathDoorBedroom: { panelColor: '#e7ddce', trimColor: '#f3efe8' },
  mainDoor: { panelColor: '#5b3f2b', trimColor: '#efe7da' },
}

/* --------------------------------------------------------------- walking -- */

/** Player collision radius: keeps the camera from clipping door frames. */
export const PLAYER_RADIUS = 0.28

/** Outer walkable limits (just inside the house walls). */
export const HOUSE_BOUNDS = { minX: -3.72, maxX: 8.72, minZ: -8.72, maxZ: 5.22 }

const near = (a, b) => Math.abs(a - b) < 1e-6

/**
 * The shared edge between two distinct rooms, as
 * `{ axis, line, lo, hi }`, or null when they are not adjacent.
 *
 * Rooms that only touch at a corner are *not* adjacent, so a zero-length
 * overlap is rejected: otherwise the living room and the bathroom would look
 * like neighbours at the single point where all four of their walls meet.
 */
export function sharedEdge(a, b) {
  let edge = null
  if (near(a.z1, b.z0)) edge = { axis: 'z', line: a.z1, lo: Math.max(a.x0, b.x0), hi: Math.min(a.x1, b.x1) }
  else if (near(b.z1, a.z0)) edge = { axis: 'z', line: b.z1, lo: Math.max(a.x0, b.x0), hi: Math.min(a.x1, b.x1) }
  else if (near(a.x1, b.x0)) edge = { axis: 'x', line: a.x1, lo: Math.max(a.z0, b.z0), hi: Math.min(a.z1, b.z1) }
  else if (near(b.x1, a.x0)) edge = { axis: 'x', line: b.x1, lo: Math.max(a.z0, b.z0), hi: Math.min(a.z1, b.z1) }
  if (!edge || edge.hi - edge.lo < 1e-9) return null
  return edge
}

/**
 * Can a walker move straight from `from` to `to`?
 *
 * Same room -> yes. Into the void -> no (you cannot walk out of the house).
 * Across a room boundary -> only through a door opening whose leaf is open and
 * wide enough for a person (`PLAYER_RADIUS` clearance on each side).
 *
 * Pure on purpose: the walkthrough, the tests and a future path planner all
 * share it.
 */
export function walkPassable(from, to, isDoorOpen = () => false) {
  const [fx, fz] = from
  const [tx, tz] = to
  const roomA = getRoomAt(fx, fz)
  const roomB = getRoomAt(tx, tz)

  if (!roomB) return false
  if (!roomA || roomA === roomB) return true

  const edge = sharedEdge(roomA, roomB)
  if (!edge) return false

  /* where the movement segment crosses the shared wall line */
  let cross
  if (edge.axis === 'z') {
    if (Math.abs(tz - fz) < 1e-9) return false
    const t = (edge.line - fz) / (tz - fz)
    if (t < 0 || t > 1) return false
    cross = fx + t * (tx - fx)
  } else {
    if (Math.abs(tx - fx) < 1e-9) return false
    const t = (edge.line - fx) / (tx - fx)
    if (t < 0 || t > 1) return false
    cross = fz + t * (tz - fz)
  }

  return DOORS.some((d) => {
    if (d.axis !== edge.axis || !near(d.line, edge.line)) return false
    const lo = d.along - d.width / 2 + PLAYER_RADIUS
    const hi = d.along + d.width / 2 - PLAYER_RADIUS
    if (cross < lo || cross > hi) return false
    return isDoorOpen(d.id) === true
  })
}

/** Clamp a walker position to the walkable box. */
export function clampToHouse(x, z) {
  return [
    Math.min(HOUSE_BOUNDS.maxX, Math.max(HOUSE_BOUNDS.minX, x)),
    Math.min(HOUSE_BOUNDS.maxZ, Math.max(HOUSE_BOUNDS.minZ, z)),
  ]
}

/* --------------------------------------------------------------- exterior -- */
/*
 * The house as a *building*: an outward-facing skin over the same envelope, a
 * flat roof with a parapet and rooftop plant, and the walled grounds it stands
 * in. The skin is generated from the room openings (see buildEnvelopeWalls), so
 * its windows line up exactly with the interior ones.
 *
 * Deliberately absent: there is NO gate (the boundary wall simply has an open
 * gap where the path leaves the plot) and NO car. Both are asserted by the
 * automated tests.
 */

/** The smallest axis-aligned rectangle containing every room. */
export const HOUSE_ENVELOPE = {
  x0: Math.min(...ROOM_LIST.map((r) => r.x0)),
  x1: Math.max(...ROOM_LIST.map((r) => r.x1)),
  z0: Math.min(...ROOM_LIST.map((r) => r.z0)),
  z1: Math.max(...ROOM_LIST.map((r) => r.z1)),
}

export const EXTERIOR = {
  envelope: HOUSE_ENVELOPE,
  /** push the outer skin off the interior wall plane so the two never z-fight */
  skinOffset: 0.1,
  /** the grounds the house sits in: an open plot with a terrace and a path */
  compound: {
    plot: { x0: -9, x1: 14, z0: -13, z1: 12 },
    boundary: { height: 1.15, thickness: 0.25, coping: 0.09 },
    /** the plain gap in the front wall where the path leaves the plot (no gate) */
    opening: { line: 12, along: 2.6, width: 2.6 },
    /** paved terrace hugging the front (south) facade */
    terrace: { x0: -1.2, x1: 6.4, z0: 5.62, z1: 9.2 },
    /** the path from the terrace out through the boundary opening */
    path: { x0: 1.4, x1: 3.8, z0: 9.2, z1: 12 },
  },
}

export const ROOF = {
  /* a parapet ring around the flat roof; the middle stays open on purpose so the
     top-down overview and the floor plan keep showing every room */
  parapet: { height: 0.5, thickness: 0.2 },
  /* an eaves/fascia band overhanging the outer wall */
  eave: { overhang: 0.34, thickness: 0.1, y: 2.95 },
  /* rooftop plant, all kept near the edges so nothing covers a room centre */
  equipment: [
    { id: 'condenserA', kind: 'condenser', position: [-2.4, 3, -8.35] },
    { id: 'condenserB', kind: 'condenser', position: [6.5, 3, -8.35] },
    { id: 'waterTank', kind: 'tank', position: [7.9, 3, -8.45] },
    { id: 'ventStack', kind: 'vent', position: [4.9, 3, -8.6] },
    { id: 'chimney', kind: 'chimney', position: [8.35, 2.95, 1.5] },
    { id: 'aerial', kind: 'aerial', position: [-3.5, 3, -8.5] },
  ],
}

