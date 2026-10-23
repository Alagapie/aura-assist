import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { DEVICE_GROUPS, describeDevice, groupForDevice, isDeviceOn } from '../config/devices'
import { ROOM_LIST, ROOMS } from '../config/house'
import { useRoomStore } from '../store/useRoomStore'
import { DeviceIcon } from './icons'

/**
 * Device list with two scopes:
 *
 *   "This room"  -> only the devices of the room you are looking at
 *   "Whole home" -> every device, grouped per room
 *
 * Devices are laid out as a two-column grid of compact tiles so a whole room
 * fits without scrolling, and every group header collapses so a long "whole
 * home" list can be folded down to just the parts you care about. Selecting a
 * tile opens the contextual panel; tapping it runs the device's primary action,
 * so the list doubles as a control surface.
 */

/** Bucket a flat device list into the catalogue's groups, in catalogue order. */
function groupsWithin(list) {
  const buckets = new Map()
  for (const device of list) {
    const group = groupForDevice(device)
    if (!buckets.has(group)) buckets.set(group, [])
    buckets.get(group).push(device)
  }
  return DEVICE_GROUPS
    .filter((g) => buckets.has(g.id))
    .map((g) => ({
      ...g,
      devices: buckets.get(g.id).sort((a, b) => a.name.localeCompare(b.name)),
    }))
}

function DeviceTile({ device }) {
  const devices = useRoomStore((s) => s.devices)
  const selectedId = useRoomStore((s) => s.selectedId)
  const select = useRoomStore((s) => s.select)
  const handleObjectClick = useRoomStore((s) => s.handleObjectClick)

  const on = isDeviceOn(device, devices)
  const selected = selectedId === device.id

  return (
    <button
      type="button"
      className={`device ${on ? 'device--on' : ''} ${selected ? 'device--selected' : ''}`}
      onClick={() => {
        select(device.id)
        if (device.type !== 'hub') handleObjectClick(device.id)
      }}
      title={`${device.name} · ${describeDevice(device, devices)}`}
    >
      <span className="device__icon"><DeviceIcon device={device} /></span>
      <span className="device__body">
        <span className="device__name">{device.name}</span>
        <span className="device__state">{describeDevice(device, devices)}</span>
      </span>
      <span className={`device__dot ${on ? 'device__dot--on' : ''}`} aria-hidden />
    </button>
  )
}

export function DeviceList() {
  const devices = useRoomStore((s) => s.devices)
  const currentRoom = useRoomStore((s) => s.currentRoom)
  const [scope, setScope] = useState('room')
  const [collapsed, setCollapsed] = useState(() => new Set())

  const all = useMemo(() => Object.values(devices), [devices])

  /**
   * "This room" is rendered as one flat grid (no group headers): a room's
   * devices all fit in the sidebar without scrolling, which is the difference
   * between a control surface and a list you have to hunt through. The
   * "whole home" scope keeps the per-room, per-group folding structure because
   * it genuinely is too long for one screen.
   */
  const roomFlat = useMemo(() => {
    if (scope !== 'room') return null
    const inRoom = all.filter((d) => d.room === currentRoom)
    const order = DEVICE_GROUPS.map((g) => g.id)
    return {
      room: ROOMS[currentRoom] || ROOMS.living,
      devices: inRoom.sort((a, b) => {
        const ga = order.indexOf(groupForDevice(a))
        const gb = order.indexOf(groupForDevice(b))
        if (ga !== gb) return ga - gb
        return a.name.localeCompare(b.name)
      }),
    }
  }, [all, scope, currentRoom])

  const sections = useMemo(() => {
    if (scope === 'room') return []
    return ROOM_LIST
      .map((room) => ({
        id: room.id,
        label: room.label,
        groups: groupsWithin(all.filter((d) => d.room === room.id)),
      }))
      .filter((section) => section.groups.length)
  }, [all, scope])

  const total = scope === 'room'
    ? (roomFlat?.devices.length ?? 0)
    : sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.devices.length, 0), 0)

  const toggleGroup = (key) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <>
      <div className="scope-toggle segmented">
        <button type="button" className={scope === 'room' ? 'on' : ''} onClick={() => setScope('room')}>
          This room
        </button>
        <button type="button" className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>
          Whole home
        </button>
      </div>

      <div className="scroll device-scroll">
        {scope === 'room' && (
          roomFlat.devices.length > 0 ? (
            <div className="device-grid device-grid--flat">
              {roomFlat.devices.map((device) => <DeviceTile key={device.id} device={device} />)}
            </div>
          ) : (
            <div className="log__row">No devices in this room yet.</div>
          )
        )}

        {scope === 'all' && sections.map((section) => (
          <div key={section.id} className="room-section">
            <div className="room-section__title">
              {section.label}
              <span className="room-section__count">
                {section.groups.reduce((m, g) => m + g.devices.length, 0)}
              </span>
            </div>
            {section.groups.map((group) => {
              const key = `${section.id}:${group.id}`
              const isCollapsed = collapsed.has(key)
              return (
                <div className="group" key={group.id}>
                  <button
                    type="button"
                    className={`group__title group__title--btn ${isCollapsed ? 'group__title--collapsed' : ''}`}
                    onClick={() => toggleGroup(key)}
                    aria-expanded={!isCollapsed}
                  >
                    <ChevronDown size={12} className="group__chevron" />
                    <span>{group.label}</span>
                    <span className="group__count">{group.devices.length}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="device-grid">
                      {group.devices.map((device) => <DeviceTile key={device.id} device={device} />)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        {scope === 'all' && total === 0 && <div className="log__row">No devices yet.</div>}
      </div>
    </>
  )
}
