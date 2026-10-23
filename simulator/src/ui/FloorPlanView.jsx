import { useMemo } from 'react'
import { X } from 'lucide-react'
import {
  ROOM_LIST, DOORS, WINDOWS, DOOR_LEAF_PLACEMENT, DOOR_FINISH,
} from '../config/house'
import { useRoomStore } from '../store/useRoomStore'
import { RoomIcon } from './icons'

/**
 * Interactive 2D floor plan drawn straight from `config/house.js`, so it can
 * never disagree with the 3D shell or the navigation. Rooms are clickable, door
 * leaves show their live open/closed state, and each room shows how many of its
 * devices are currently active.
 *
 * World (x, z) maps to SVG (x, y) with +z pointing down, i.e. south is down —
 * the standard way to draw a floor plan.
 */

const MIN_X = -4
const MAX_X = 9
const MIN_Z = -9
const MAX_Z = 5.5
const S = 22
const PAD = 30
const W = (MAX_X - MIN_X) * S + PAD * 2
const H = (MAX_Z - MIN_Z) * S + PAD * 2

const px = (x) => PAD + (x - MIN_X) * S
const py = (z) => PAD + (z - MIN_Z) * S

const ROOM_TINT = {
  living: '#7dd3fc',
  bedroom: '#c4b5fd',
  kitchen: '#fcd34d',
  bathroom: '#5eead4',
  hallway: '#fca5a5',
}

/** A wall opening drawn as a thick segment across the room border. */
function Opening({ opening, open }) {
  const horiz = opening.axis === 'z'
  const half = opening.width / 2
  const x1 = horiz ? px(opening.along - half) : px(opening.line)
  const x2 = horiz ? px(opening.along + half) : px(opening.line)
  const y1 = horiz ? py(opening.line) : py(opening.along - half)
  const y2 = horiz ? py(opening.line) : py(opening.along + half)
  const isDoor = opening.kind === 'door'
  const color = isDoor ? (open ? '#5eead4' : '#fbbf24') : '#7dd3fc'
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={color}
      strokeWidth={isDoor ? 5 : 4}
      strokeLinecap="round"
      opacity={isDoor && !open ? 0.55 : 0.95}
    />
  )
}

/** The swing arc of a door leaf, drawn from its hinge into the room. */
function DoorSwing({ id }) {
  const open = useRoomStore((s) => s.devices[id]?.open === true)
  const place = DOOR_LEAF_PLACEMENT[id]
  const door = DOORS.find((d) => d.id === id)
  if (!place || !door) return null

  const hx = place.hinge[0]
  const hz = place.hinge[1]
  const r = door.width
  // closed leaf lies along the wall; open leaf swings by `openAngle`
  const baseAngle = door.axis === 'z' ? 180 : 90
  const a0 = (baseAngle * Math.PI) / 180
  const a1 = a0 + (place.openAngle || 0)
  const arc = open
    ? `M ${px(hx + Math.cos(a0) * r)} ${py(hz + Math.sin(a0) * r)} A ${r * S} ${r * S} 0 0 ${
      place.openAngle > 0 ? 1 : 0
    } ${px(hx + Math.cos(a1) * r)} ${py(hz + Math.sin(a1) * r)}`
    : ''
  const leafX = open ? hx + Math.cos(a1) * r : hx + Math.cos(a0) * r
  const leafZ = open ? hz + Math.sin(a1) * r : hz + Math.sin(a0) * r

  return (
    <g>
      {open && <path d={arc} fill="none" stroke="#5eead4" strokeWidth={1.4} opacity={0.6} strokeDasharray="3 3" />}
      <line
        x1={px(hx)} y1={py(hz)} x2={px(leafX)} y2={py(leafZ)}
        stroke={DOOR_FINISH[id]?.panelColor || '#7a5637'}
        strokeWidth={3.4}
        strokeLinecap="round"
      />
    </g>
  )
}

export function FloorPlanView() {
  const floorPlanOpen = useRoomStore((s) => s.floorPlanOpen)
  const closeFloorPlan = useRoomStore((s) => s.closeFloorPlan)
  const currentRoom = useRoomStore((s) => s.currentRoom)
  const goToRoom = useRoomStore((s) => s.goToRoom)
  const devices = useRoomStore((s) => s.devices)

  const counts = useMemo(() => {
    const map = {}
    for (const device of Object.values(devices)) {
      const active = device.power === true || device.open === true
      if (!map[device.room]) map[device.room] = { total: 0, active: 0 }
      map[device.room].total += 1
      if (active) map[device.room].active += 1
    }
    return map
  }, [devices])

  if (!floorPlanOpen) return null

  return (
    <div className="floorplan-backdrop" onClick={closeFloorPlan}>
      <div className="floorplan glass" onClick={(e) => e.stopPropagation()}>
        <header className="floorplan__head">
          <div>
            <div className="floorplan__title">Floor plan</div>
            <div className="floorplan__sub">Click a room to fly there · doors show live state</div>
          </div>
          <button type="button" className="panel__close" onClick={closeFloorPlan} aria-label="Close floor plan">
            <X size={17} />
          </button>
        </header>

        <svg viewBox={`0 0 ${W} ${H}`} className="floorplan__svg" role="img" aria-label="House floor plan">
          {/* room slabs */}
          {ROOM_LIST.map((room) => {
            const active = currentRoom === room.id
            return (
              <g key={room.id} className="floorplan__room" onClick={() => goToRoom(room.id)}>
                <rect
                  x={px(room.x0)} y={py(room.z0)}
                  width={(room.x1 - room.x0) * S} height={(room.z1 - room.z0) * S}
                  rx={6}
                  fill={ROOM_TINT[room.id]}
                  fillOpacity={active ? 0.3 : 0.13}
                  stroke={active ? '#5eead4' : '#ffffff'}
                  strokeOpacity={active ? 0.9 : 0.22}
                  strokeWidth={active ? 2.4 : 1.4}
                />
                <text
                  x={px((room.x0 + room.x1) / 2)}
                  y={py((room.z0 + room.z1) / 2) - 4}
                  className="floorplan__label"
                >
                  {room.label}
                </text>
                <text
                  x={px((room.x0 + room.x1) / 2)}
                  y={py((room.z0 + room.z1) / 2) + 12}
                  className="floorplan__meta"
                >
                  {counts[room.id]?.active || 0}/{counts[room.id]?.total || 0} active
                </text>
              </g>
            )
          })}

          {/* openings + door swings */}
          {WINDOWS.map((w) => <Opening key={w.id} opening={w} />)}
          {DOORS.map((d) => (
            <Opening key={d.id} opening={d} open={devices[d.id]?.open === true} />
          ))}
          {DOORS.map((d) => <DoorSwing key={`swing-${d.id}`} id={d.id} />)}
        </svg>

        <footer className="floorplan__legend">
          <span><i className="dot dot--door" /> door</span>
          <span><i className="dot dot--open" /> open door</span>
          <span><i className="dot dot--window" /> window</span>
          <span className="floorplan__rooms">
            {ROOM_LIST.map((room) => (
              <button
                key={room.id}
                type="button"
                className={`roommini ${currentRoom === room.id ? 'roommini--active' : ''}`}
                onClick={() => goToRoom(room.id)}
              >
                <RoomIcon room={room.id} size={13} />
                {room.short}
              </button>
            ))}
          </span>
        </footer>
      </div>
    </div>
  )
}
