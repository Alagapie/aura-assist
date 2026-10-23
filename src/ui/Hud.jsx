import { useEffect, useState } from 'react'
import {
  BarChart3, Camera, Footprints, Home, Info, List, Map, MousePointerClick, RotateCcw, X,
} from 'lucide-react'
import { useRoomStore } from '../store/useRoomStore'
import { AutomationControls } from './AutomationControls'
import { DeviceList } from './DeviceList'
import { DevicePanel } from './DevicePanel'
import { FloorPlanView } from './FloorPlanView'
import { ReportsView } from './ReportsView'
import { RoomNavigation } from './RoomNavigation'
import { StatusBar } from './StatusBar'
import { ViewControls, CameraShortcuts } from './ViewControls'
import { AuraChat } from './AuraChat'
import { ConnectionPanel } from './ConnectionPanel'
import { ROOMS } from '../config/house'

/** Top-right floating tools: view mode, reset and sidebar toggle. */
function TopBar() {
  const cameraMode = useRoomStore((s) => s.cameraMode)
  const setCameraMode = useRoomStore((s) => s.setCameraMode)
  const resetView = useRoomStore((s) => s.resetView)
  const selectedId = useRoomStore((s) => s.selectedId)
  const toggleSidebar = useRoomStore((s) => s.toggleSidebar)
  const sidebarOpen = useRoomStore((s) => s.sidebarOpen)
  const floorPlanOpen = useRoomStore((s) => s.floorPlanOpen)
  const toggleFloorPlan = useRoomStore((s) => s.toggleFloorPlan)
  const reportsOpen = useRoomStore((s) => s.reportsOpen)
  const toggleReports = useRoomStore((s) => s.toggleReports)

  return (
    <div className={`topbar ${selectedId ? 'topbar--shifted' : ''}`}>
      <button
        type="button"
        className={`tool sidebar-toggle ${sidebarOpen ? 'tool--active' : ''}`}
        onClick={toggleSidebar}
        title="Show or hide the device list"
        aria-label="Toggle device list"
      >
        <List size={17} />
      </button>
      <button
        type="button"
        className={`tool ${cameraMode === 'orbit' ? 'tool--active' : ''}`}
        onClick={() => setCameraMode('orbit')}
        title="Orbit, zoom and inspect (recommended)"
      >
        <Camera size={17} />
      </button>
      <button
        type="button"
        className={`tool ${cameraMode === 'walk' ? 'tool--active' : ''}`}
        onClick={() => setCameraMode('walk')}
        title="First person walkthrough (WASD + mouse)"
      >
        <Footprints size={17} />
      </button>
      <button
        type="button"
        className={`tool ${floorPlanOpen ? 'tool--active' : ''}`}
        onClick={toggleFloorPlan}
        title="Interactive 2D floor plan"
      >
        <Map size={17} />
      </button>
      <button
        type="button"
        className={`tool ${reportsOpen ? 'tool--active' : ''}`}
        onClick={toggleReports}
        title="Energy & climate report"
      >
        <BarChart3 size={17} />
      </button>
      <button type="button" className="tool" onClick={resetView} title="Reset the camera">
        <RotateCcw size={17} />
      </button>
    </div>
  )
}

/** Recent device commands - makes the simulated backend visible. */
function ActivityCard() {
  const log = useRoomStore((s) => s.log)
  // Collapsed by default: the device list is the primary control surface and
  // must fit without scrolling, so the log only takes its header row until you
  // ask for it.
  const [open, setOpen] = useState(false)

  return (
    <section className="card glass activity-card" style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column' }}>
      <div className="card__head" style={{ marginBottom: open ? 6 : 0 }}>
        <MousePointerClick size={13} color="#5eead4" />
        <span className="card__title">Activity</span>
        <button
          type="button"
          className="panel__close"
          style={{ marginLeft: 'auto' }}
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Collapse activity' : 'Expand activity'}
        >
          {open ? <X size={14} /> : <Info size={14} />}
        </button>
      </div>
      {open && (
        <div className="log scroll" style={{ flex: 1, maxHeight: 150 }}>
          {log.length === 0 && <div className="log__row">Waiting for commands…</div>}
          {log.map((entry) => (
            <div key={entry.id} className={`log__row log__row--${entry.level}`}>
              <span className="log__time">
                {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span>{entry.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Click-to-look overlay and crosshair for the walkthrough mode. */
function WalkLayer() {
  const cameraMode = useRoomStore((s) => s.cameraMode)
  const walkLocked = useRoomStore((s) => s.walkLocked)
  if (cameraMode !== 'walk') return null
  if (walkLocked) {
    return (
      <>
        <div className="crosshair" />
        <div className="walk-hint glass">
          <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Shift</kbd> run · aim the crosshair and click to control · <kbd>Esc</kbd> release
        </div>
      </>
    )
  }
  return (
    <div className="lock-surface">
      <div className="lock-surface__card glass">
        <div className="lock-surface__title">Walkthrough mode</div>
        <div className="lock-surface__sub">
          Click anywhere to capture the mouse.<br />
          <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to walk · <kbd>Esc</kbd> to release the cursor.
        </div>
      </div>
    </div>
  )
}

function HintToast() {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const fade = setTimeout(() => setFading(true), 9000)
    const hide = setTimeout(() => setVisible(false), 9800)
    return () => {
      clearTimeout(fade)
      clearTimeout(hide)
    }
  }, [])

  if (!visible) return null
  return (
    <button
      type="button"
      className={`toast glass ${fading ? 'toast--hidden' : ''}`}
      onClick={() => setVisible(false)}
      style={{ cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)' }}
    >
      <MousePointerClick size={14} color="#5eead4" />
      Click any object to control it · drag to orbit · scroll to zoom · press V to talk to Alexa, your voice assistant · press A for AuraAssist · use , . / 0 and the pad below to change viewpoint
    </button>
  )
}

/** Full interface overlay. */
export function Hud() {
  const sidebarOpen = useRoomStore((s) => s.sidebarOpen)
  const toggleSidebar = useRoomStore((s) => s.toggleSidebar)
  const currentRoom = useRoomStore((s) => s.currentRoom)
  const devices = useRoomStore((s) => s.devices)
  const room = ROOMS[currentRoom] || ROOMS.living
  const roomDevices = Object.values(devices).filter((d) => d.room === room.id).length
  const [connectionOpen, setConnectionOpen] = useState(false)

  return (
    <div className="hud">
      <div className={`sidebar ${sidebarOpen ? '' : 'sidebar--closed'}`}>
        <header className="brand glass">
          <span className="brand__logo"><Home size={19} /></span>
          <div>
            <div className="brand__name">Smart Home Simulator</div>
            <div className="brand__meta">{room.label} · {roomDevices} devices</div>
          </div>
          <button
            type="button"
            className="panel__close sidebar-toggle"
            onClick={toggleSidebar}
            aria-label="Hide the device list"
          >
            <X size={16} />
          </button>
        </header>
        <AutomationControls />
        <section className="card glass" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="card__head">
            <List size={13} color="#5eead4" />
            <span className="card__title">Devices</span>
          </div>
          <DeviceList />
        </section>
        <ActivityCard />
      </div>

      <RoomNavigation />
      <TopBar />
      <DevicePanel />
      <WalkLayer />
      <ViewControls />
      <CameraShortcuts />
      <HintToast />
      <StatusBar onOpenConnection={() => setConnectionOpen(true)} />
      <ConnectionPanel open={connectionOpen} onClose={() => setConnectionOpen(false)} />
      <AuraChat />
      <FloorPlanView />
      <ReportsView />
    </div>
  )
}
