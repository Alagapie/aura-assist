import { HOUSE_HEIGHT } from '../../config/house.js'

/**
 * Turns the pure room rectangles in `config/house.js` into drawable wall
 * descriptors for `makeWallGeometry`.
 *
 * Every room renders its own four single-sided walls with the normal facing
 * *into* the room. Two rooms that share a boundary each draw their own panel,
 * but because the panels face opposite directions only one is ever visible from
 * a given camera, and because the shared doorway is cut out of both you can see
 * straight through into the next room. This keeps the doll-house cutaway that
 * makes the whole house legible while still being a single connected space.
 *
 * A wall descriptor is:
 *   { center:[x,z], rotation:[0,yaw,0], width, holes:[{x,y,w,h}] }
 * where `holes` are in the local wall coordinate system expected by
 * `makeWallGeometry` (x/y measured from the wall centre).
 *
 * @param {{x0,x1,z0,z1}} room
 * @param {Array} openings  openings from config/house.js
 * @returns {Array} four descriptors, one per edge
 */
export function buildRoomWalls(room, openings = [], height = HOUSE_HEIGHT) {
  const cx = (room.x0 + room.x1) / 2
  const cz = (room.z0 + room.z1) / 2

  // `sign` converts a world "along" coordinate into the local wall x, which
  // flips depending on the wall's yaw (see comments on each edge).
  const edges = [
    { axis: 'z', line: room.z0, centerAlong: cx, center: [cx, room.z0], rot: 0, sign: 1 },
    { axis: 'z', line: room.z1, centerAlong: cx, center: [cx, room.z1], rot: Math.PI, sign: -1 },
    { axis: 'x', line: room.x0, centerAlong: cz, center: [room.x0, cz], rot: Math.PI / 2, sign: -1 },
    { axis: 'x', line: room.x1, centerAlong: cz, center: [room.x1, cz], rot: -Math.PI / 2, sign: 1 },
  ]

  return edges.map((edge) => {
    const isZ = edge.axis === 'z'
    const width = isZ ? room.x1 - room.x0 : room.z1 - room.z0
    const holes = openings
      .filter((o) => o.axis === edge.axis && Math.abs(o.line - edge.line) < 1e-6)
      .map((o) => ({
        x: edge.sign * (o.along - edge.centerAlong),
        y: (o.y0 + o.y1) / 2 - height / 2,
        w: o.width,
        h: o.y1 - o.y0,
      }))
    return { center: edge.center, rotation: [0, edge.rot, 0], width, holes, axis: edge.axis, line: edge.line }
  })
}

/**
 * The outward-facing skin of the whole building.
 *
 * `buildRoomWalls` gives the four walls of a rectangle with their normals
 * pointing *inward*; turning each panel a half turn and pushing it outward
 * gives the same envelope a set of walls whose normals point *out*, so orbiting
 * outside the house shows a solid building while the interior (which only ever
 * sees the inward panels) is completely unchanged.
 *
 * The skin reuses the very same `openings`, so every window is cut through the
 * outer wall exactly where it is cut through the inner one. `offset` separates
 * it from the interior wall plane so the two never z-fight.
 *
 * @returns {Array} four descriptors, one per envelope edge, facing outward
 */
export function buildEnvelopeWalls(rect, openings = [], { offset = 0.1, height = HOUSE_HEIGHT } = {}) {
  return buildRoomWalls(rect, openings, height).map((wall) => {
    const r = wall.rotation[1]
    // inward normal is (sin r, cos r); outward is its negation
    return {
      ...wall,
      center: [wall.center[0] - Math.sin(r) * offset, wall.center[1] - Math.cos(r) * offset],
      rotation: [0, r + Math.PI, 0],
      // the half turn mirrors the panel, so the holes mirror with it
      holes: wall.holes.map((h) => ({ ...h, x: -h.x })),
    }
  })
}
