import { Activity, Clock, Droplets, Fan, Lightbulb, Thermometer, Wifi, Zap } from 'lucide-react'
import { isDeviceOn } from '../config/devices'
import { houseEnergyReport, formatWatts } from '../config/reports'
import { ROOMS } from '../config/house'
import { useRoomStore } from '../store/useRoomStore'
import { RoomIcon } from './icons'

/** Bottom bar: current room, active scene, household counts and conditions. */
export function StatusBar({ onOpenConnection }) {
  const devices = useRoomStore((s) => s.devices)
  const room = useRoomStore((s) => s.room)
  const activeMode = useRoomStore((s) => s.activeMode)
  const backendLabel = useRoomStore((s) => s.backendLabel)
  const bridgeStatus = useRoomStore((s) => s.bridgeStatus)
  const currentRoom = useRoomStore((s) => s.currentRoom)
  const toggleReports = useRoomStore((s) => s.toggleReports)

  const list = Object.values(devices)
  const lightsOn = list.filter((d) => d.type === 'light' && d.power).length
  const activeCount = list.filter((d) => isDeviceOn(d, devices)).length
  const climateOn = list.filter((d) => (d.type === 'fan' || d.type === 'ac') && d.power).length
  const current = ROOMS[currentRoom] || ROOMS.living
  const watts = houseEnergyReport(devices).totalWatts

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <footer className="statusbar glass">
      <span className="chip chip--accent">
        <RoomIcon room={current.id} size={12} /> {current.label}
      </span>
      <span className="chip">
        <span className="chip__dot" /> {activeMode}
      </span>
      <span className="chip">
        <Activity size={12} /> {activeCount} active
      </span>
      <span className="chip chip--amber">
        <Lightbulb size={12} /> {lightsOn} light{lightsOn === 1 ? '' : 's'}
      </span>
      <button
        type="button"
        className="chip chip--amber statusbar__btn"
        onClick={toggleReports}
        title="Open the energy & climate report"
      >
        <Zap size={12} /> {formatWatts(watts)}
      </button>
      <span className="chip hide-sm">
        <Thermometer size={12} /> {room.temp.toFixed(1)}°C
      </span>
      <span className="chip hide-sm">
        <Droplets size={12} /> {room.humidity.toFixed(0)}%
      </span>
      <span className="chip hide-sm">
        <Fan size={12} /> {climateOn} climate
      </span>
      <span className="statusbar__spacer" />
      <button
        type="button"
        className={`chip chip--btn hide-sm ${bridgeStatus === 'online' ? 'chip--accent' : ''}`}
        onClick={onOpenConnection}
        title={
          bridgeStatus === 'online'
            ? 'Live link to the AuraAssist server - click to change server'
            : `AuraAssist link: ${bridgeStatus} - click to find the server`
        }
      >
        <Wifi size={12} /> {backendLabel}
      </button>
      <span className="chip">
        <Clock size={12} /> {time}
      </span>
    </footer>
  )
}
