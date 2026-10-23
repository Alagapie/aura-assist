import { useMemo } from 'react'
import {
  Activity, Droplets, Flame, Gauge, Leaf, Snowflake, Sun, Thermometer, Wind, X, Zap,
} from 'lucide-react'
import { useRoomStore } from '../store/useRoomStore'
import { ROOMS } from '../config/house'
import {
  houseEnergyReport, climateReport, formatWatts, formatKwh, formatCost,
} from '../config/reports'
import { DeviceIcon } from './icons'

/**
 * Household report overlay: a live energy and climate read-out computed from the
 * exact device state the 3D scene renders. The energy model lives in
 * config/reports.js, so the numbers shown here, the status-bar chip and the AI
 * facade can never disagree.
 */
export function ReportsView() {
  const reportsOpen = useRoomStore((s) => s.reportsOpen)
  const closeReports = useRoomStore((s) => s.closeReports)
  const devices = useRoomStore((s) => s.devices)
  const room = useRoomStore((s) => s.room)
  const energy = useRoomStore((s) => s.energy)
  const currentRoom = useRoomStore((s) => s.currentRoom)
  const goToRoom = useRoomStore((s) => s.goToRoom)

  const report = useMemo(() => houseEnergyReport(devices), [devices])
  const climate = useMemo(() => climateReport(room, devices), [room, devices])

  if (!reportsOpen) return null

  const climateIcon = climate.heating ? <Flame size={14} /> : climate.cooling ? <Snowflake size={14} /> : <Wind size={14} />
  const activeRoom = ROOMS[currentRoom] || ROOMS.living

  return (
    <div className="floorplan-backdrop" onClick={closeReports}>
      <div className="report glass" onClick={(e) => e.stopPropagation()}>
        <header className="floorplan__head">
          <div>
            <div className="floorplan__title">Household report</div>
            <div className="floorplan__sub">Live energy and climate · computed from the device state</div>
          </div>
          <button type="button" className="panel__close" onClick={closeReports} aria-label="Close report">
            <X size={17} />
          </button>
        </header>

        <div className="report__grid">
          {/* -------------------------------------------------- energy ---- */}
          <section className="report__card">
            <div className="report__card-head">
              <Zap size={14} color="#fbbf24" />
              <span>Energy</span>
              <span className="report__badge">now</span>
            </div>

            <div className="report__hero">
              <div className="report__hero-value">{formatWatts(report.totalWatts)}</div>
              <div className="report__hero-sub">
                live load · {report.activeCount} of {report.deviceCount} devices drawing
              </div>
            </div>

            <div className="readout">
              <div className="readout__item">
                <div className="readout__label">Today</div>
                <div className="readout__value">{formatKwh(energy.kwhToday)}</div>
              </div>
              <div className="readout__item">
                <div className="readout__label">Cost today</div>
                <div className="readout__value">{formatCost(energy.kwhToday)}</div>
              </div>
            </div>
            <div className="readout" style={{ marginTop: 8 }}>
              <div className="readout__item">
                <div className="readout__label">Per hour</div>
                <div className="readout__value">{formatCost(report.costPerHour)}</div>
              </div>
              <div className="readout__item">
                <div className="readout__label">Peak</div>
                <div className="readout__value">{formatWatts(energy.peakWatts)}</div>
              </div>
            </div>

            <div className="report__bars">
              {report.byRoom.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`report__bar-row ${currentRoom === r.id ? 'report__bar-row--active' : ''}`}
                  onClick={() => goToRoom(r.id)}
                  title={`${r.label}: ${formatWatts(r.watts)}`}
                >
                  <span className="report__bar-label">{r.short}</span>
                  <span className="report__bar-track">
                    <span className="report__bar-fill" style={{ width: `${Math.round(r.share * 100)}%` }} />
                  </span>
                  <span className="report__bar-value">{formatWatts(r.watts)}</span>
                </button>
              ))}
            </div>

            {report.top.length > 0 && (
              <ul className="report__list">
                {report.top.map((d) => (
                  <li key={d.id}>
                    <DeviceIcon device={devices[d.id]} size={13} />
                    <span className="report__list-name">{d.name}</span>
                    <span className="report__list-value">{formatWatts(d.watts)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ------------------------------------------------- climate ---- */}
          <section className="report__card">
            <div className="report__card-head">
              <Thermometer size={14} color="#5eead4" />
              <span>Climate</span>
              <span className="report__badge">{activeRoom.short}</span>
            </div>

            <div className="report__hero">
              <div className="report__hero-value">{climate.temp.toFixed(1)}°C</div>
              <div className="report__hero-sub">
                <Activity size={12} /> {climate.trend} · feels {climate.comfort}
              </div>
            </div>

            <div className="readout">
              <div className="readout__item">
                <div className="readout__label"><Droplets size={10} /> Humidity</div>
                <div className="readout__value">{climate.humidity.toFixed(0)}%</div>
              </div>
              <div className="readout__item">
                <div className="readout__label"><Sun size={10} /> Outdoors</div>
                <div className="readout__value">{climate.ambientTemp.toFixed(1)}°C</div>
              </div>
            </div>

            <div className="report__card-head" style={{ marginTop: 14 }}>
              <Gauge size={13} color="#93c5fd" />
              <span>Air conditioning</span>
            </div>
            <ul className="report__list">
              {Object.values(devices).filter((d) => d.type === 'ac').map((ac) => (
                <li key={ac.id}>
                  {ac.power ? climateIcon : <Leaf size={13} />}
                  <span className="report__list-name">{ac.name}</span>
                  <span className="report__list-value">
                    {ac.power ? `${ac.mode} · ${ac.targetTemp}°C` : 'off'}
                  </span>
                </li>
              ))}
            </ul>

            <p className="report__note">
              {climate.heating
                ? 'Heat pump is warming the room toward the target.'
                : climate.cooling
                  ? 'Cooling toward the target; the outdoor temperature pulls the room back over time.'
                  : 'No active conditioning — the room is drifting toward the outdoor temperature.'}
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
