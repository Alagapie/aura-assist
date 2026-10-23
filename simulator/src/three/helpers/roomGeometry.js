import * as THREE from 'three'

/**
 * Builds a flat single-sided wall panel with rectangular openings cut out of it.
 *
 * The geometry lives in the XY plane (normal +Z) with the origin at the centre
 * of the wall, so a wall is placed with `position=[x, height/2, z]` plus a Y
 * rotation. Because the faces are single sided, walls facing away from the
 * camera are automatically invisible: the default camera looks into the room
 * like a doll-house cutaway, and clicking through a wall still reaches the
 * objects inside.
 *
 * @param {number} width   total wall width
 * @param {number} height  total wall height
 * @param {Array<{x:number,y:number,w:number,h:number}>} holes  openings, in
 *        local wall coordinates (x from wall centre, y from wall centre)
 */
export function makeWallGeometry(width, height, holes = []) {
  const shape = new THREE.Shape()
  shape.moveTo(-width / 2, -height / 2)
  shape.lineTo(width / 2, -height / 2)
  shape.lineTo(width / 2, height / 2)
  shape.lineTo(-width / 2, height / 2)
  shape.closePath()

  for (const hole of holes) {
    const path = new THREE.Path()
    const x0 = hole.x - hole.w / 2
    const x1 = hole.x + hole.w / 2
    const y0 = hole.y - hole.h / 2
    const y1 = hole.y + hole.h / 2
    path.moveTo(x0, y0)
    path.lineTo(x0, y1)
    path.lineTo(x1, y1)
    path.lineTo(x1, y0)
    path.closePath()
    shape.holes.push(path)
  }

  const geometry = new THREE.ShapeGeometry(shape, 1)
  geometry.computeVertexNormals()

  // ShapeGeometry assigns UVs in world units; normalise them to 0..1 so the
  // texture repeat props behave predictably.
  const uv = geometry.attributes.uv
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, (uv.getX(i) + width / 2) / width, (uv.getY(i) + height / 2) / height)
  }
  uv.needsUpdate = true

  return geometry
}

/** Room dimensions shared by every component. */
export const ROOM = {
  width: 8, // x: -4 .. 4
  depth: 6, // z: -3 .. 3
  height: 3,
  wallThickness: 0.12,
  window: {
    wall: 'left',
    z: -0.7, // centre of the window along the wall
    width: 2.4,
    sill: 0.9,
    height: 1.5,
  },
  entryDoor: { wall: 'front', x: 2.6, width: 0.95, height: 2.1 },
  interiorDoor: { wall: 'right', z: 1.2, width: 0.95, height: 2.1 },
}

/** Clamp helper used by animation loops. */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
