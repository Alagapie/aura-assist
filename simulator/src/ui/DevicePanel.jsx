import {
  Bell, BellRing, ChevronLeft, ChevronRight, Droplets, Flame, Lock, Minus, Plus, Power,
  Smartphone, Sparkles, Unlock, Utensils, Volume2, VolumeX, X,
} from 'lucide-react'
import { useRoomStore } from '../store/useRoomStore'
import { describeDevice, sensorActive, AC_MODE_LABEL } from '../config/devices'
import { CHANNELS, getChannel } from '../three/appliances/Television'
import { DeviceIcon } from './icons'
import { ModeGrid } from './AutomationControls'

const LIGHT_COLORS = ['#fff2dd', '#ffd9a0', '#ffb066', '#ff8f52', '#ff6b6b', '#a78bfa', '#5eead4', '#93c5fd']

/**
 * Contextual control panel. It renders the controls that make sense for the
 * selected device and pushes every change through the same store actions the
 * 3D scene uses.
 */
export function DevicePanel() {
  const selectedId = useRoomStore((s) => s.selectedId)
  const device = useRoomStore((s) => (s.selectedId ? s.devices[s.selectedId] : null))
  const devices = useRoomStore((s) => s.devices)
  const clearSelection = useRoomStore((s) => s.clearSelection)

  if (!selectedId || !device) return null

  return (
    <aside className="panel glass">
      <header className="panel__head">
        <span className="panel__icon"><DeviceIcon device={device} size={17} /></span>
        <div>
          <div className="panel__title">{device.name}</div>
          <div className="panel__sub">{describeDevice(device, devices)}</div>
        </div>
        <button type="button" className="panel__close" onClick={clearSelection} aria-label="Close panel">
          <X size={17} />
        </button>
      </header>
      <div className="panel__body scroll">
        <Controls device={device} />
      </div>
    </aside>
  )
}

function Controls({ device }) {
  switch (device.type) {
    case 'light': return <LightControls device={device} />
    case 'tv': return <TvControls device={device} />
    case 'ac': return <AcControls device={device} />
    case 'fan': return <FanControls device={device} />
    case 'fridge': return <FridgeControls device={device} />
    case 'cooker': return <CookerControls device={device} />
    case 'shower': return <ShowerControls device={device} />
    case 'curtains': return <CurtainControls device={device} />
    case 'door': return <DoorControls device={device} />
    case 'lock': return <LockControls device={device} />
    case 'doorbell': return <DoorbellControls device={device} />
    case 'sensor': return <SensorControls device={device} />
    case 'switch': return <SwitchControls device={device} />
    case 'prop': return <PropControls device={device} />
    case 'hub': return <HubControls />
    default: return null
  }
}

/* ------------------------------------------------------------------ light -- */

function LightControls({ device }) {
  const setDeviceState = useRoomStore((s) => s.commit)

  const setPatch = (patch) => {
    const power = patch.brightness !== undefined ? patch.brightness > 0.02 : device.power
    setDeviceState(device.id, { ...patch, power }, 'light.set')
  }

  return (
    <>
      <button
        type="button"
        className={`power-btn ${device.power ? 'power-btn--on' : ''}`}
        onClick={() => setDeviceState(device.id, { power: !device.power }, 'power.set')}
      >
        <Power size={15} /> {device.power ? 'Turn off' : 'Turn on'}
      </button>

      <div className="field">
        <div className="field__label">
          <span>Brightness</span>
          <span className="field__value">{Math.round(device.brightness * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(device.brightness * 100)}
          onChange={(e) => setPatch({ brightness: Number(e.target.value) / 100 })}
        />
      </div>

      <div className="field">
        <div className="field__label"><span>Colour</span></div>
        <div className="swatches">
          {LIGHT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`swatch ${device.color?.toLowerCase() === color ? 'swatch--active' : ''}`}
              style={{ background: color }}
              aria-label={`Colour ${color}`}
              onClick={() => setPatch({ color, power: true })}
            />
          ))}
          <label className="swatch swatch--picker" title="Custom colour">
            <input
              type="color"
              value={device.color}
              onChange={(e) => setPatch({ color: e.target.value, power: true })}
            />
          </label>
        </div>
      </div>

      <div className="field">
        <div className="field__label"><span>Warm / cool presets</span></div>
        <div className="segmented">
          {[
            ['Cosy', 0.35, '#ffb066'],
            ['Relax', 0.6, '#ffd9a0'],
            ['Focus', 1, '#ffeacb'],
          ].map(([label, brightness, color]) => (
            <button
              key={label}
              type="button"
              className={device.power && device.brightness === brightness ? 'on' : ''}
              onClick={() => setDeviceState(device.id, { power: true, brightness, color }, 'light.set')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/* --------------------------------------------------------------------- tv -- */

function TvControls({ device }) {
  const setDeviceState = useRoomStore((s) => s.commit)
  const channel = getChannel(device.channel)

  const changeChannel = (dir) => {
    const index = CHANNELS.findIndex((c) => c.n === device.channel)
    const next = CHANNELS[(index + dir + CHANNELS.length) % CHANNELS.length]
    setDeviceState(device.id, { channel: next.n, power: true }, 'tv.set')
  }

  return (
    <>
      <button
        type="button"
        className={`power-btn ${device.power ? 'power-btn--on' : ''}`}
        onClick={() => setDeviceState(device.id, { power: !device.power }, 'power.set')}
      >
        <Power size={15} /> {device.power ? 'Turn off' : 'Turn on'}
      </button>

      <div className="tv-display">
        <div className="tv-display__ch">Channel {String(device.channel).padStart(2, '0')}</div>
        <div className="tv-display__name">{channel.name}</div>
        <div className="tv-display__meta">
          {device.power ? (device.muted ? 'Muted' : `Volume ${device.volume}%`) : 'Screen off'}
        </div>
      </div>

      <div className="field">
        <div className="field__label"><span>Channel</span></div>
        <div className="segmented">
          <button type="button" onClick={() => changeChannel(-1)} aria-label="Previous channel">
            <ChevronLeft size={15} />
          </button>
          {CHANNELS.map((c) => (
            <button
              key={c.n}
              type="button"
              className={c.n === device.channel ? 'on' : ''}
              onClick={() => setDeviceState(device.id, { channel: c.n, power: true }, 'tv.set')}
            >
              {c.n}
            </button>
          ))}
          <button type="button" onClick={() => changeChannel(1)} aria-label="Next channel">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="field">
        <div className="field__label">
          <span>Volume</span>
          <span className="field__value">{device.muted ? 'Muted' : `${device.volume}%`}</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={device.volume}
          onChange={(e) => setDeviceState(device.id, { volume: Number(e.target.value), muted: false, power: true }, 'tv.set')}
        />
        <div className="segmented" style={{ marginTop: 8 }}>
          <button
            type="button"
            className={device.muted ? 'on' : ''}
            onClick={() => setDeviceState(device.id, { muted: !device.muted }, 'tv.set')}
          >
            {device.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span style={{ marginLeft: 6 }}>{device.muted ? 'Unmute' : 'Mute'}</span>
          </button>
          <button type="button" onClick={() => setDeviceState(device.id, { volume: 10 }, 'tv.set')}>Night volume</button>
        </div>
      </div>
    </>
  )
}

/* --------------------------------------------------------------------- ac -- */

function AcControls({ device }) {
  const setDeviceState = useRoomStore((s) => s.commit)
  const room = useRoomStore((s) => s.room)
  const setTemp = (delta) => {
    const targetTemp = Math.min(30, Math.max(16, device.targetTemp + delta))
    setDeviceState(device.id, { targetTemp, power: true }, 'ac.set')
  }

  return (
    <>
      <button
        type="button"
        className={`power-btn ${device.power ? 'power-btn--on' : ''}`}
        onClick={() => setDeviceState(device.id, { power: !device.power }, 'power.set')}
      >
        <Power size={15} /> {device.power ? 'Turn off' : 'Turn on'}
      </button>

      <div className="field">
        <div className="field__label"><span>Target temperature</span></div>
        <div className="stepper">
          <button type="button" onClick={() => setTemp(-1)} aria-label="Lower temperature"><Minus size={16} /></button>
          <div className="stepper__value">
            {device.targetTemp}°C
            <small>{device.power ? (AC_MODE_LABEL[device.mode] || 'Cooling') : 'Standby'}</small>
          </div>
          <button type="button" onClick={() => setTemp(1)} aria-label="Raise temperature"><Plus size={16} /></button>
        </div>
      </div>

      <div className="field">
        <div className="field__label"><span>Mode</span></div>
        <div className="segmented segmented--wrap">
          {[['cool', 'Cool'], ['heat', 'Heat'], ['dry', 'Dry'], ['auto', 'Auto'], ['fan', 'Fan only']].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={device.mode === mode ? 'on' : ''}
              onClick={() => setDeviceState(device.id, { mode, power: true }, 'ac.set')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="readout">
        <div className="readout__item">
          <div className="readout__label">Room</div>
          <div className="readout__value">{room.temp.toFixed(1)}°C</div>
        </div>
        <div className="readout__item">
          <div className="readout__label">Humidity</div>
          <div className="readout__value">{room.humidity.toFixed(0)}%</div>
        </div>
      </div>
    </>
  )
}

/* -------------------------------------------------------------------- fan -- */

function FanControls({ device }) {
  const setDeviceState = useRoomStore((s) => s.commit)
  return (
    <>
      <button
        type="button"
        className={`power-btn ${device.power ? 'power-btn--on' : ''}`}
        onClick={() => setDeviceState(device.id, { power: !device.power }, 'power.set')}
      >
        <Power size={15} /> {device.power ? 'Turn off' : 'Turn on'}
      </button>

      <div className="field">
        <div className="field__label">
          <span>Speed</span>
          <span className="field__value">{['Off', 'Low', 'Medium', 'High'][device.power ? device.speed : 0]}</span>
        </div>
        <div className="segmented">
          {[1, 2, 3].map((speed) => (
            <button
              key={speed}
              type="button"
              className={device.power && device.speed === speed ? 'on' : ''}
              onClick={() => setDeviceState(device.id, { speed, power: true }, 'fan.set')}
            >
              {['Low', 'Med', 'High'][speed - 1]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field__label"><span>Oscillation</span></div>
        <div className="segmented">
          <button
            type="button"
            className={device.oscillate ? 'on' : ''}
            onClick={() => setDeviceState(device.id, { oscillate: true }, 'fan.set')}
          >
            Sweep
          </button>
          <button
            type="button"
            className={!device.oscillate ? 'on' : ''}
            onClick={() => setDeviceState(device.id, { oscillate: false }, 'fan.set')}
          >
            Fixed
          </button>
        </div>
      </div>
    </>
  )
}

/* --------------------------------------------------------------- curtains -- */

function CurtainControls({ device }) {
  const setDeviceState = useRoomStore((s) => s.commit)
  return (
    <>
      <button
        type="button"
        className={`power-btn ${device.open ? 'power-btn--on' : ''}`}
        onClick={() => setDeviceState(device.id, { open: !device.open }, 'cover.set')}
      >
        {device.open ? 'Close curtains' : 'Open curtains'}
      </button>
      <div className="readout">
        <div className="readout__item">
          <div className="readout__label">Position</div>
          <div className="readout__value">{device.open ? '100%' : '0%'}</div>
        </div>
        <div className="readout__item">
          <div className="readout__label">Daylight</div>
          <div className="readout__value">{device.open ? 'High' : 'Low'}</div>
        </div>
      </div>
      <p className="field__label" style={{ marginTop: 14, textTransform: 'none', letterSpacing: 0, fontSize: 11.5 }}>
        Motorised curtain tracks. The panels animate smoothly between their
        gathered and closed positions.
      </p>
    </>
  )
}

/* ------------------------------------------------------------------- door -- */

function DoorControls({ device }) {
  const setDeviceState = useRoomStore((s) => s.commit)
  return (
    <button
      type="button"
      className={`power-btn ${device.open ? 'power-btn--on' : ''}`}
      onClick={() => setDeviceState(device.id, { open: !device.open }, 'door.set')}
    >
      {device.open ? 'Close door' : 'Open door'}
    </button>
  )
}

/* ---------------------------------------------------------------- fridge -- */

function FridgeControls({ device }) {
  const setDeviceState = useRoomStore((s) => s.commit)
  const setTemp = (delta) => {
    const targetTemp = Math.min(8, Math.max(0, device.targetTemp + delta))
    setDeviceState(device.id, { targetTemp }, 'fridge.set')
  }
  const anyOpen = device.open || device.freezerOpen
  return (
    <>
      <button
        type="button"
        className={`power-btn ${device.power ? 'power-btn--on' : ''}`}
        onClick={() => setDeviceState(device.id, { power: !device.power }, 'fridge.set')}
      >
        <Power size={15} /> {device.power ? 'Switch off' : 'Switch on'}
      </button>

      <div className="field">
        <div className="field__label"><span>Doors</span></div>
        <div className="btn-row">
          <button
            type="button"
            className={`power-btn ${device.open ? 'power-btn--on' : ''}`}
            onClick={() => setDeviceState(device.id, { open: !device.open }, 'fridge.set')}
          >
            {device.open ? 'Close fridge' : 'Open fridge'}
          </button>
          <button
            type="button"
            className={`power-btn ${device.freezerOpen ? 'power-btn--on' : ''}`}
            onClick={() => setDeviceState(device.id, { freezerOpen: !device.freezerOpen }, 'fridge.set')}
          >
            {device.freezerOpen ? 'Close freezer' : 'Open freezer'}
          </button>
        </div>
        <button
          type="button"
          className="link-btn"
          onClick={() => setDeviceState(device.id, { open: !anyOpen, freezerOpen: !anyOpen }, 'fridge.set')}
        >
          {anyOpen ? 'Close both doors' : 'Open both doors'}
        </button>
      </div>

      <div className="field">
        <div className="field__label"><span>Fridge temperature</span></div>
        <div className="stepper">
          <button type="button" onClick={() => setTemp(-1)} aria-label="Colder"><Minus size={16} /></button>
          <div className="stepper__value">
            {device.targetTemp}°C
            <small>{anyOpen ? 'Doors open' : device.power ? 'Cooling' : 'Off'}</small>
          </div>
          <button type="button" onClick={() => setTemp(1)} aria-label="Warmer"><Plus size={16} /></button>
        </div>
      </div>

      <div className="readout">
        <div className="readout__item">
          <div className="readout__label">Compressor</div>
          <div className="readout__value">{device.power ? 'Running' : 'Idle'}</div>
        </div>
        <div className="readout__item">
          <div className="readout__label">Fridge door</div>
          <div className="readout__value">{device.open ? 'Open' : 'Closed'}</div>
        </div>
        <div className="readout__item">
          <div className="readout__label">Freezer door</div>
          <div className="readout__value">{device.freezerOpen ? 'Open' : 'Closed'}</div>
        </div>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- cooker -- */

function CookerControls({ device }) {
  const setDeviceState = useRoomStore((s) => s.commit)
  const hobOn = device.power && device.heat > 0
  return (
    <>
      <button
        type="button"
        className={`power-btn ${device.power ? 'power-btn--on' : ''}`}
        onClick={() => setDeviceState(device.id, { power: !device.power }, 'cooker.set')}
      >
        <Power size={15} /> {device.power ? 'Switch off' : 'Switch on'}
      </button>

      <div className="field">
        <div className="field__label">
          <span><Flame size={12} style={{ verticalAlign: '-2px' }} /> Hob</span>
          <span className="field__value">{hobOn ? `Level ${device.heat}` : 'Off'}</span>
        </div>
        <div className="segmented">
          {[0, 1, 2, 3].map((heat) => (
            <button
              key={heat}
              type="button"
              className={hobOn && device.heat === heat ? 'on' : ''}
              onClick={() => setDeviceState(device.id, { heat, power: heat > 0 }, 'cooker.set')}
            >
              {heat === 0 ? 'Off' : heat}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field__label"><span>Oven</span></div>
        <div className="segmented">
          <button
            type="button"
            className={device.ovenOn ? 'on' : ''}
            onClick={() => setDeviceState(device.id, { ovenOn: true, power: true }, 'cooker.set')}
          >
            On
          </button>
          <button
            type="button"
            className={!device.ovenOn ? 'on' : ''}
            onClick={() => setDeviceState(device.id, { ovenOn: false }, 'cooker.set')}
          >
            Off
          </button>
        </div>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- shower -- */

function ShowerControls({ device }) {
  const setDeviceState = useRoomStore((s) => s.commit)
  const setTemp = (delta) => {
    const temp = Math.min(45, Math.max(30, device.temp + delta))
    setDeviceState(device.id, { temp }, 'shower.set')
  }
  return (
    <>
      <button
        type="button"
        className={`power-btn ${device.power ? 'power-btn--on' : ''}`}
        onClick={() => setDeviceState(device.id, { power: !device.power }, 'shower.set')}
      >
        <Droplets size={15} /> {device.power ? 'Stop water' : 'Start water'}
      </button>

      <div className="field">
        <div className="field__label"><span>Water temperature</span></div>
        <div className="stepper">
          <button type="button" onClick={() => setTemp(-1)} aria-label="Cooler"><Minus size={16} /></button>
          <div className="stepper__value">
            {device.temp}°C
            <small>{device.power ? 'Running' : 'Off'}</small>
          </div>
          <button type="button" onClick={() => setTemp(1)} aria-label="Warmer"><Plus size={16} /></button>
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ lock -- */

function LockControls({ device }) {
  const setDeviceState = useRoomStore((s) => s.commit)
  return (
    <>
      <button
        type="button"
        className={`power-btn ${device.locked ? 'power-btn--on' : ''}`}
        onClick={() => setDeviceState(device.id, { locked: !device.locked }, 'lock.set')}
      >
        {device.locked ? <Lock size={15} /> : <Unlock size={15} />}
        {device.locked ? 'Unlock the front door' : 'Lock the front door'}
      </button>
      <div className="readout">
        <div className="readout__item">
          <div className="readout__label">Bolt</div>
          <div className="readout__value">{device.locked ? 'Thrown' : 'Retracted'}</div>
        </div>
        <div className="readout__item">
          <div className="readout__label">Status</div>
          <div className="readout__value">{device.locked ? 'Secure' : 'Open'}</div>
        </div>
      </div>
    </>
  )
}

/* -------------------------------------------------------------- doorbell -- */

function DoorbellControls({ device }) {
  const ringDoorbell = useRoomStore((s) => s.ringDoorbell)
  return (
    <>
      <button
        type="button"
        className={`power-btn ${device.ringing ? 'power-btn--on' : ''}`}
        onClick={() => ringDoorbell(device.id)}
      >
        {device.ringing ? <BellRing size={15} /> : <Bell size={15} />}
        {device.ringing ? 'Ringing…' : 'Ring the doorbell'}
      </button>
      <p className="field__label" style={{ marginTop: 14, textTransform: 'none', letterSpacing: 0, fontSize: 11.5 }}>
        Simulated chime at the front door. The ring clears itself after a couple
        of seconds, and the entry sensor mirrors the main door.
      </p>
    </>
  )
}

/* ---------------------------------------------------------------- sensor -- */

const SENSOR_COPY = {
  entry: { topic: 'Contact', rest: 'Closed', active: 'Open' },
  occupancy: { topic: 'Motion', rest: 'Clear', active: 'Motion' },
  water: { topic: 'Water', rest: 'Dry', active: 'Water detected' },
  smoke: { topic: 'Smoke', rest: 'Clear', active: 'Alarm' },
}

function SensorControls({ device }) {
  const pulseSensor = useRoomStore((s) => s.pulseSensor)
  const copy = SENSOR_COPY[device.sensorKind] || { topic: 'Reading', rest: '—', active: 'Active' }
  const active = sensorActive(device)
  return (
    <>
      <div className="readout">
        <div className="readout__item">
          <div className="readout__label">{copy.topic}</div>
          <div className="readout__value">{active ? copy.active : copy.rest}</div>
        </div>
        <div className="readout__item">
          <div className="readout__label">Online</div>
          <div className="readout__value">{device.online ? 'Yes' : 'No'}</div>
        </div>
      </div>
      <button type="button" className="power-btn" onClick={() => pulseSensor(device.id)}>
        <Power size={15} /> Simulate a {copy.topic.toLowerCase()} event
      </button>
      <p className="field__label" style={{ marginTop: 14, textTransform: 'none', letterSpacing: 0, fontSize: 11.5 }}>
        Simulated sensor readings. Toggle them here to watch the activity log and
        the 3D indicator react.
      </p>
    </>
  )
}

/* ----------------------------------------------------------------- switch -- */

function SwitchControls({ device }) {
  const devices = useRoomStore((s) => s.devices)
  const toggleSwitch = useRoomStore((s) => s.toggleSwitch)
  const on = device.controls.filter((id) => devices[id]?.power).length
  return (
    <>
      <button
        type="button"
        className={`power-btn ${on ? 'power-btn--on' : ''}`}
        onClick={() => toggleSwitch(device.id)}
      >
        <Power size={15} /> {on ? 'Switch off' : 'Switch on'}
      </button>
      <div className="field">
        <div className="field__label"><span>Wired circuits</span></div>
        {device.controls.map((id) => (
          <div key={id} className="device" style={{ cursor: 'default' }}>
            <span className="device__body">
              <span className="device__name">{devices[id]?.name}</span>
              <span className="device__state">{devices[id]?.power ? 'Powered' : 'No power'}</span>
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------- prop -- */

const PROP_COPY = {
  phone: { topic: 'Screen' },
  remote: { topic: 'Paired' },
  pepper: { topic: 'Mill' },
  utensils: { topic: 'Crock' },
}

function PropControls({ device }) {
  const devices = useRoomStore((s) => s.devices)
  const handlePropClick = useRoomStore((s) => s.handlePropClick)
  const copy = PROP_COPY[device.propKind] || { topic: 'Prop' }
  const target = device.targets ? devices[device.targets] : null

  return (
    <>
      <div className="readout">
        <div className="readout__item">
          <div className="readout__label">{copy.topic}</div>
          <div className="readout__value" style={{ fontSize: 13 }}>
            {describeDevice(device, devices)}
          </div>
        </div>
        {device.propKind === 'phone' && (
          <div className="readout__item">
            <div className="readout__label">Battery</div>
            <div className="readout__value">{device.battery}%</div>
          </div>
        )}
      </div>

      <button
        type="button"
        className={`power-btn ${(device.screen || target?.power || device.inUse || device.grind) ? 'power-btn--on' : ''}`}
        onClick={() => handlePropClick(device.id)}
      >
        {device.propKind === 'phone' && <Smartphone size={15} />}
        {device.propKind === 'remote' && <Power size={15} />}
        {device.propKind === 'pepper' && <Sparkles size={15} />}
        {device.propKind === 'utensils' && <Utensils size={15} />}
        {device.propKind === 'phone' && (device.screen ? 'Lock the screen' : 'Wake the phone')}
        {device.propKind === 'remote' && `Toggle the ${device.targetLabel || 'device'}`}
        {device.propKind === 'pepper' && (device.grind ? 'Grinding…' : 'Grind some pepper')}
        {device.propKind === 'utensils' && (device.inUse ? 'Put the utensils back' : 'Pick up a utensil')}
      </button>

      <p className="field__label" style={{ marginTop: 14, textTransform: 'none', letterSpacing: 0, fontSize: 11.5 }}>
        {device.propKind === 'remote'
          ? 'This handheld remote is paired with the appliance in this room — pressing it toggles that device, so the remote and the appliance never drift apart.'
          : 'A small everyday object. Click it in the scene or here; its state is tracked alongside the smart devices.'}
      </p>
    </>
  )
}

/* -------------------------------------------------------------------- hub -- */

function HubControls() {
  return (
    <>
      <ModeGrid />
      <p className="field__label" style={{ marginTop: 12, textTransform: 'none', letterSpacing: 0, fontSize: 11.5 }}>
        This wall panel mirrors the whole room. Scenes below drive the same
        device state as the wall switches and the 3D objects.
      </p>
    </>
  )
}
