import { LayoutGrid, Map } from 'lucide-react'
import { ROOM_LIST } from '../config/house'
import { useRoomStore } from '../store/useRoomStore'
import { RoomIcon } from './icons'

/**
 * Floating room switcher, centred along the top edge so it never covers the
 * sidebar or the device panel. Clicking a room flies the camera there; the
 * active room is highlighted, and the two trailing buttons jump to the
 * whole-house overview and the top-down floor plan.
 */
export function RoomNavigation() {
  const currentRoom = useRoomStore((s) => s.currentRoom)
  const view = useRoomStore((s) => s.view)
  const goToRoom = useRoomStore((s) => s.goToRoom)
  const setOverview = useRoomStore((s) => s.setOverview)
  const setFloorPlan = useRoomStore((s) => s.setFloorPlan)
  const toggleFloorPlan = useRoomStore((s) => s.toggleFloorPlan)
  const floorPlanOpen = useRoomStore((s) => s.floorPlanOpen)

  return (
    <nav className="roombar glass">
      {ROOM_LIST.map((room) => {
        const active = view === 'room' && currentRoom === room.id
        return (
          <button
            key={room.id}
            type="button"
            className={`roombar__item ${active ? 'roombar__item--active' : ''}`}
            onClick={() => goToRoom(room.id)}
            title={`Go to the ${room.label}`}
          >
            <RoomIcon room={room.id} />
            <span>{room.short}</span>
          </button>
        )
      })}

      <span className="roombar__divider" />

      <button
        type="button"
        className={`roombar__item ${view === 'overview' ? 'roombar__item--active' : ''}`}
        onClick={setOverview}
        title="Dollhouse view of the whole home"
      >
        <LayoutGrid size={15} strokeWidth={1.9} />
        <span>Overview</span>
      </button>
      <button
        type="button"
        className={`roombar__item ${view === 'floorplan' ? 'roombar__item--active' : ''}`}
        onClick={setFloorPlan}
        title="Straight-down floor plan of the 3D house"
      >
        <Map size={15} strokeWidth={1.9} />
        <span>Top-down</span>
      </button>
      <button
        type="button"
        className={`roombar__item ${floorPlanOpen ? 'roombar__item--active' : ''}`}
        onClick={toggleFloorPlan}
        title="Interactive 2D floor plan (click a room)"
      >
        <Map size={15} strokeWidth={1.9} />
        <span>Map</span>
      </button>
    </nav>
  )
}
