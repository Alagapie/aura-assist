import { useEffect } from 'react'
import { ZoomIn, ZoomOut, Maximize, ChevronLeft, ChevronRight, Eye, Lock, Unlock } from 'lucide-react'
import { useRoomStore } from '../store/useRoomStore'
import { ROOM_LIST, roomViewCount, roomViewPreset } from '../config/house'

/**
 * Bottom-centre camera controls: zoom in/out, "fit the whole room" and a
 * viewpoint stepper. The stepper is the direct answer to "I can see one side of
 * a room but reaching the other side drags the camera across the rest of the
 * house" - each room now exposes a few framings (see `views` in config/house.js)
 * so a different side is one click away instead of a long orbit.
 */
export function ViewControls() {
  const view = useRoomStore((s) => s.view)
  const roomView = useRoomStore((s) => s.roomView)
  const currentRoom = useRoomStore((s) => s.currentRoom)
  const cycleRoomView = useRoomStore((s) => s.cycleRoomView)
  const fitRoom = useRoomStore((s) => s.fitRoom)
  const zoomBy = useRoomStore((s) => s.zoomBy)
  const roomIsolation = useRoomStore((s) => s.roomIsolation)
  const toggleRoomIsolation = useRoomStore((s) => s.toggleRoomIsolation)

  const inRoom = view === 'room'
  const count = roomViewCount(currentRoom)
  const preset = inRoom ? roomViewPreset(currentRoom, roomView) : null
  const label = inRoom ? (preset?.label || 'View') : view === 'overview' ? 'Whole house' : 'Top-down'

  return (
    <div className="viewctl glass" role="group" aria-label="Camera controls">
      <button type="button" className="viewctl__btn" onClick={() => zoomBy(-1)} title="Zoom out (−)" aria-label="Zoom out">
        <ZoomOut size={16} />
      </button>
      <button type="button" className="viewctl__btn" onClick={() => zoomBy(1)} title="Zoom in (+)" aria-label="Zoom in">
        <ZoomIn size={16} />
      </button>
      <span className="viewctl__divider" />
      <button type="button" className="viewctl__btn" onClick={fitRoom} title="Fit the whole room in view (0)" aria-label="Fit room">
        <Maximize size={16} />
      </button>
      <button
        type="button"
        className={`viewctl__btn viewctl__btn--wide ${roomIsolation && inRoom ? 'viewctl__btn--on' : ''}`}
        onClick={toggleRoomIsolation}
        title={roomIsolation
          ? 'Room only: this room is shown on its own, so you can orbit and pull back freely and never see outside (press i)'
          : 'Whole house: every room and the exterior are shown; scrolling out moves to the whole-house view (press i)'}
        aria-label={roomIsolation ? 'This room only — click to show the whole house' : 'Whole house — click to show only this room'}
      >
        {roomIsolation ? <Lock size={15} /> : <Unlock size={15} />}
        {inRoom && <span className="viewctl__btnlabel">{roomIsolation ? 'Room only' : 'Whole house'}</span>}
      </button>

      {inRoom && (
        <>
          <span className="viewctl__divider" />
          <button
            type="button"
            className="viewctl__btn"
            onClick={() => cycleRoomView(-1)}
            title="Previous viewpoint (,)"
            aria-label="Previous viewpoint"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="viewctl__label" title={`Viewpoint ${roomView + 1} of ${count} · press , / . to change`}>
            <Eye size={13} />
            {label}
            <em>{roomView + 1}/{count}</em>
          </span>
          <button
            type="button"
            className="viewctl__btn"
            onClick={() => cycleRoomView(1)}
            title="Next viewpoint (.)"
            aria-label="Next viewpoint"
          >
            <ChevronRight size={16} />
          </button>
        </>
      )}
    </div>
  )
}

const isTyping = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

/**
 * Keyboard shortcuts for navigation (inactive during the first-person
 * walkthrough, which owns WASD and Escape itself):
 *   +/-  zoom       0  fit room      , .  previous / next viewpoint
 *   1-5  jump to a room             O  overview      P  top-down
 *   I    toggle room-only / whole-house view   R  reset the camera   Esc  clear selection
 */
export function CameraShortcuts() {
  useEffect(() => {
    const onKey = (event) => {
      const s = useRoomStore.getState()
      if (s.cameraMode !== 'orbit' || s.walkLocked) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTyping(document.activeElement)) return

      switch (event.key) {
        case '+': case '=': s.zoomBy(1); break
        case '-': case '_': s.zoomBy(-1); break
        case '0': s.fitRoom(); break
        case ',': case '<': s.cycleRoomView(-1); break
        case '.': case '>': s.cycleRoomView(1); break
        case 'o': case 'O': s.setOverview(); break
        case 'p': case 'P': s.setFloorPlan(); break
        case 'i': case 'I': s.toggleRoomIsolation(); break
        case 'r': case 'R': s.resetView(); break
        case '1': case '2': case '3': case '4': case '5': {
          const room = ROOM_LIST[Number(event.key) - 1]
          if (room) s.goToRoom(room.id)
          break
        }
        case 'Escape': s.clearSelection(); break
        default: return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return null
}
