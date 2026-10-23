/**
 * Device catalogue: initial simulated state + UI grouping/icon metadata.
 *
 * Every device carries a `room` id (see config/house.js) so the same catalogue
 * drives the global device list, the per-room lists and the 3D scene. Adding a
 * device here (plus a matching 3D component) is all that is needed to extend
 * the simulator.
 */

export const createInitialDevices = () => ({
  /* ============================== LIVING ROOM ============================= */
  ceilingLightA: {
    id: 'ceilingLightA', type: 'light', lightKind: 'ceiling', room: 'living',
    name: 'Ceiling Light · Left', power: true, brightness: 0.85, color: '#ffd9a0', online: true,
  },
  ceilingLightB: {
    id: 'ceilingLightB', type: 'light', lightKind: 'ceiling', room: 'living',
    name: 'Ceiling Light · Right', power: true, brightness: 0.85, color: '#ffd9a0', online: true,
  },
  sconceLeft: {
    id: 'sconceLeft', type: 'light', lightKind: 'wall', room: 'living',
    name: 'Wall Sconce · Left', power: false, brightness: 0.7, color: '#ffbe7a', online: true,
  },
  sconceRight: {
    id: 'sconceRight', type: 'light', lightKind: 'wall', room: 'living',
    name: 'Wall Sconce · Right', power: false, brightness: 0.7, color: '#ffbe7a', online: true,
  },
  tableLamp: {
    id: 'tableLamp', type: 'light', lightKind: 'table', room: 'living',
    name: 'Table Lamp', power: true, brightness: 0.6, color: '#ffc98a', online: true,
  },
  floorLamp: {
    id: 'floorLamp', type: 'light', lightKind: 'floor', room: 'living',
    name: 'Floor Lamp', power: false, brightness: 0.75, color: '#ffe0b0', online: true,
  },
  tv: {
    id: 'tv', type: 'tv', room: 'living', name: 'Living Room TV',
    power: false, volume: 24, channel: 1, muted: false, online: true,
  },
  ac: {
    id: 'ac', type: 'ac', room: 'living', name: 'Living Room AC',
    power: true, targetTemp: 22, mode: 'cool', online: true,
  },
  fan: {
    id: 'fan', type: 'fan', room: 'living', name: 'Standing Fan',
    power: false, speed: 2, oscillate: true, online: true,
  },
  curtains: {
    id: 'curtains', type: 'curtains', room: 'living', name: 'Living Room Curtains',
    open: true, online: true,
  },
  switchA: {
    id: 'switchA', type: 'switch', room: 'living', name: 'Switch · Main Lights',
    controls: ['ceilingLightA', 'ceilingLightB'], online: true,
  },
  switchB: {
    id: 'switchB', type: 'switch', room: 'living', name: 'Switch · Sconces',
    controls: ['sconceLeft', 'sconceRight'], online: true,
  },
  hub: { id: 'hub', type: 'hub', room: 'living', name: 'Smart Control Panel', online: true },
  // Small interactable props: not "smart" devices, but the same commit path
  // makes them clickable in the scene and visible in the list, which is what
  // makes the rooms feel lived in.
  phone: {
    id: 'phone', type: 'prop', propKind: 'phone', room: 'living', name: 'Table Phone',
    location: 'on the coffee table',
    // The screen stays lit: a face-up phone with a dark, switched-off screen
    // reads as a smudge to the vision model, and "where is my phone" has to
    // work from the camera, not just from the device list.
    screen: true, charging: true, battery: 68, online: true,
  },
  tvRemote: {
    id: 'tvRemote', type: 'prop', propKind: 'remote', room: 'living', name: 'TV Remote',
    targets: 'tv', targetLabel: 'TV', online: true,
  },
  // interior doors keep their Phase-1 device ids so the original living-room
  // interactions carry over; entryDoor now leads to the hall, interiorDoor to
  // the kitchen.
  entryDoor: {
    id: 'entryDoor', type: 'door', room: 'living', name: 'Door to Hall',
    open: false, online: true,
  },
  interiorDoor: {
    id: 'interiorDoor', type: 'door', room: 'living', name: 'Door to Kitchen',
    open: false, online: true,
  },

  /* =============================== BEDROOM ================================ */
  bedroomLight: {
    id: 'bedroomLight', type: 'light', lightKind: 'ceiling', room: 'bedroom',
    name: 'Bedroom Ceiling Light', power: false, brightness: 0.7, color: '#ffd9a0', online: true,
  },
  bedLampLeft: {
    id: 'bedLampLeft', type: 'light', lightKind: 'table', room: 'bedroom',
    name: 'Bedside Lamp · Left', power: false, brightness: 0.5, color: '#ffc98a', online: true,
  },
  bedLampRight: {
    id: 'bedLampRight', type: 'light', lightKind: 'table', room: 'bedroom',
    name: 'Bedside Lamp · Right', power: false, brightness: 0.5, color: '#ffc98a', online: true,
  },
  bedroomAC: {
    id: 'bedroomAC', type: 'ac', room: 'bedroom', name: 'Bedroom AC',
    power: false, targetTemp: 23, mode: 'cool', online: true,
  },
  bedroomCurtains: {
    id: 'bedroomCurtains', type: 'curtains', room: 'bedroom', name: 'Bedroom Curtains',
    open: true, online: true,
  },
  wardrobeDoor: {
    id: 'wardrobeDoor', type: 'door', room: 'bedroom', name: 'Wardrobe',
    open: false, online: true,
  },
  bedroomPanel: { id: 'bedroomPanel', type: 'hub', room: 'bedroom', name: 'Bedroom Panel', online: true },
  bedroomRemote: {
    id: 'bedroomRemote', type: 'prop', propKind: 'remote', room: 'bedroom', name: 'Bedside Remote',
    targets: 'bedroomAC', targetLabel: 'AC', online: true,
  },
  bedroomDoor: {
    id: 'bedroomDoor', type: 'door', room: 'bedroom', name: 'Bedroom Door',
    open: false, online: true,
  },

  /* =============================== KITCHEN ================================ */
  kitchenLight: {
    id: 'kitchenLight', type: 'light', lightKind: 'ceiling', room: 'kitchen',
    name: 'Kitchen Ceiling Light', power: true, brightness: 0.9, color: '#fff2dd', online: true,
  },
  kitchenStrip: {
    id: 'kitchenStrip', type: 'light', lightKind: 'undercab', room: 'kitchen',
    name: 'Under-Cabinet Strip', power: false, brightness: 0.8, color: '#ffe9cf', online: true,
  },
  fridge: {
    id: 'fridge', type: 'fridge', room: 'kitchen', name: 'Fridge-Freezer',
    power: true, open: false, freezerOpen: false, targetTemp: 3, online: true,
  },
  cooker: {
    id: 'cooker', type: 'cooker', room: 'kitchen', name: 'Oven & Cooktop',
    power: false, heat: 0, ovenOn: false, online: true,
  },
  rangeHood: {
    id: 'rangeHood', type: 'fan', lightKind: null, room: 'kitchen', name: 'Range Hood',
    power: false, speed: 1, oscillate: false, online: true,
  },
  kitchenPanel: { id: 'kitchenPanel', type: 'hub', room: 'kitchen', name: 'Kitchen Panel', online: true },
  pepperMill: {
    id: 'pepperMill', type: 'prop', propKind: 'pepper', room: 'kitchen', name: 'Pepper Mill',
    grind: false, level: 0.9, online: true,
  },
  utensilCrock: {
    id: 'utensilCrock', type: 'prop', propKind: 'utensils', room: 'kitchen', name: 'Utensil Crock',
    inUse: false, count: 4, online: true,
  },
  hallKitchenDoor: {
    id: 'hallKitchenDoor', type: 'door', room: 'kitchen', name: 'Hall Door',
    open: false, online: true,
  },

  /* ============================== BATHROOM ================================ */
  bathroomLight: {
    id: 'bathroomLight', type: 'light', lightKind: 'ceiling', room: 'bathroom',
    name: 'Bathroom Light', power: true, brightness: 0.85, color: '#eaf2ff', online: true,
  },
  mirrorLight: {
    id: 'mirrorLight', type: 'light', lightKind: 'vanity', room: 'bathroom',
    name: 'Mirror Light', power: false, brightness: 0.9, color: '#ffffff', online: true,
  },
  bathFan: {
    id: 'bathFan', type: 'fan', room: 'bathroom', name: 'Bathroom Exhaust',
    power: false, speed: 1, oscillate: false, online: true,
  },
  shower: {
    id: 'shower', type: 'shower', room: 'bathroom', name: 'Shower',
    power: false, temp: 38, online: true,
  },
  bathDoorKitchen: {
    id: 'bathDoorKitchen', type: 'door', room: 'bathroom', name: 'Bathroom Door',
    open: false, online: true,
  },
  bathDoorBedroom: {
    id: 'bathDoorBedroom', type: 'door', room: 'bathroom', name: 'En-suite Door',
    open: false, online: true,
  },
  occupancySensor: {
    id: 'occupancySensor', type: 'sensor', sensorKind: 'occupancy', room: 'bathroom',
    name: 'Occupancy Sensor', value: 'clear', online: true,
  },
  waterSensor: {
    id: 'waterSensor', type: 'sensor', sensorKind: 'water', room: 'bathroom',
    name: 'Water Leak Sensor', value: 'dry', online: true,
  },

  /* =============================== HALLWAY ================================ */
  hallLight: {
    id: 'hallLight', type: 'light', lightKind: 'ceiling', room: 'hallway',
    name: 'Hall Ceiling Light', power: true, brightness: 0.8, color: '#ffd9a0', online: true,
  },
  porchLight: {
    id: 'porchLight', type: 'light', lightKind: 'wall', room: 'hallway',
    name: 'Entry Sconce', power: false, brightness: 0.7, color: '#ffe0b0', online: true,
  },
  doorLock: {
    id: 'doorLock', type: 'lock', room: 'hallway', name: 'Front Door Lock',
    locked: true, online: true,
  },
  mainDoor: {
    id: 'mainDoor', type: 'door', room: 'hallway', name: 'Main Entrance Door',
    open: false, online: true,
  },
  doorbell: {
    id: 'doorbell', type: 'doorbell', room: 'hallway', name: 'Doorbell',
    ringing: false, online: true,
  },
  entrySensor: {
    id: 'entrySensor', type: 'sensor', sensorKind: 'entry', room: 'hallway',
    name: 'Entry Sensor', value: 'closed', online: true,
  },
  hallPanel: { id: 'hallPanel', type: 'hub', room: 'hallway', name: 'Hall Panel', online: true },
})

/**
 * Global device ordering for the "whole home" list. Room lists are derived
 * automatically from each device's `room` field.
 */
export const DEVICE_GROUPS = [
  { id: 'lights', label: 'Lighting' },
  { id: 'media', label: 'Media' },
  { id: 'climate', label: 'Climate' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'access', label: 'Covers & Doors' },
  { id: 'safety', label: 'Security & Sensors' },
  { id: 'props', label: 'Accessories' },
  { id: 'switches', label: 'Wall Switches' },
  { id: 'hub', label: 'Hubs' },
]

const GROUP_FOR_TYPE = {
  light: 'lights', tv: 'media', ac: 'climate', fan: 'climate', shower: 'climate',
  fridge: 'kitchen', cooker: 'kitchen',
  curtains: 'access', door: 'access', lock: 'safety', doorbell: 'safety', sensor: 'safety',
  prop: 'props',
  switch: 'switches', hub: 'hub',
}

export const groupForDevice = (device) => GROUP_FOR_TYPE[device?.type] || 'access'

/**
 * The two readings every simulated sensor toggles between: `[rest, active]`.
 * Kept here so the store, the UI and the tests agree on the vocabulary.
 */
export const SENSOR_STATES = {
  entry: ['closed', 'open'],
  occupancy: ['clear', 'detected'],
  water: ['dry', 'wet'],
  smoke: ['clear', 'alarm'],
}

/** The reading a sensor reports after a pulse (its "other" value). */
export function nextSensorValue(device) {
  const [rest, active] = SENSOR_STATES[device?.sensorKind] || ['clear', 'triggered']
  return device?.value === active ? rest : active
}

/** Is a sensor currently reporting its active (alerting) reading? */
export function sensorActive(device) {
  const [, active] = SENSOR_STATES[device?.sensorKind] || ['clear', 'triggered']
  return device?.value === active
}

/** Human labels for the AC / heat-pump operating modes. */
export const AC_MODES = ['cool', 'heat', 'dry', 'auto', 'fan']
export const AC_MODE_LABEL = {
  cool: 'Cooling', heat: 'Heating', dry: 'Drying', auto: 'Auto', fan: 'Fan only',
}

/** One-line state for the small interactive props. */
function describeProp(device, devices) {
  switch (device.propKind) {
    case 'phone':
      return device.screen
        ? `Screen on · ${device.battery}%`
        : `Screen off${device.charging ? ' · charging' : ''}`
    case 'remote': {
      const target = devices?.[device.targets]
      const kind = device.targetLabel || (target?.type === 'ac' ? 'AC' : 'TV')
      if (!target) return 'Paired'
      if (!target.power) return `${kind} on standby`
      if (target.type === 'ac') return `${AC_MODE_LABEL[target.mode] || 'Cooling'} · ${target.targetTemp}°C`
      return `${kind} on · vol ${target.muted ? 0 : target.volume}%`
    }
    case 'pepper':
      return device.grind ? 'Grinding…' : `Mill ${Math.round((device.level ?? 1) * 100)}% full`
    case 'utensils':
      return device.inUse ? 'In use' : `${device.count ?? 4} utensils`
    default:
      return 'Accessory'
  }
}

/** Human readable one-line state used by the device list and the status bar. */
export function describeDevice(device, devices) {
  if (!device) return ''
  switch (device.type) {
    case 'light':
      return device.power ? `On · ${Math.round(device.brightness * 100)}%` : 'Off'
    case 'tv':
      return device.power ? `CH ${String(device.channel).padStart(2, '0')} · Vol ${device.muted ? 0 : device.volume}%` : 'Standby'
    case 'ac':
      if (!device.power) return 'Off'
      return `${AC_MODE_LABEL[device.mode] || 'Cooling'} · ${device.targetTemp}°C`
    case 'fan':
      return device.power ? `Speed ${device.speed}${device.oscillate ? ' · oscillating' : ''}` : 'Off'
    case 'shower':
      return device.power ? `Running · ${device.temp}°C` : 'Off'
    case 'fridge': {
      const doors = []
      if (device.open) doors.push('fridge open')
      if (device.freezerOpen) doors.push('freezer open')
      if (doors.length) return doors.join(' · ')
      return `${device.targetTemp}°C · ${device.power ? 'Cooling' : 'Idle'}`
    }
    case 'cooker':
      if (device.ovenOn) return `Oven on · ${device.heat ? `Hob ${device.heat}` : 'heating'}`
      return device.power ? `Hob on · level ${device.heat}` : 'Off'
    case 'curtains':
      return device.open ? 'Open' : 'Closed'
    case 'door':
      return device.open ? 'Open' : 'Closed'
    case 'lock':
      return device.locked ? 'Locked' : 'Unlocked'
    case 'doorbell':
      return device.ringing ? 'Ringing…' : 'Idle'
    case 'sensor': {
      if (sensorActive(device)) {
        return device.sensorKind === 'occupancy' ? 'Motion'
          : device.sensorKind === 'water' ? 'Water detected'
            : device.sensorKind === 'entry' ? 'Open'
              : String(device.value)
      }
      return device.sensorKind === 'occupancy' ? 'Clear'
        : device.sensorKind === 'water' ? 'Dry'
          : device.sensorKind === 'entry' ? 'Closed'
            : String(device.value)
    }
    case 'switch': {
      const on = device.controls.filter((id) => devices[id]?.power).length
      return on === 0 ? 'Off' : `${on}/${device.controls.length} on`
    }
    case 'hub':
      return 'Ready'
    case 'prop':
      return describeProp(device, devices)
    default:
      return ''
  }
}

/**
 * Is the device currently in its "active" state? Drives the list-row highlight
 * and the little on/off toggle, so it must match what clicking the row does:
 * a fridge is "on" when its door is open, a lock when it is locked, etc.
 * `devices` is only needed for grouped devices (wall switches).
 */
export function isDeviceOn(device, devices) {
  switch (device?.type) {
    case 'light': case 'tv': case 'ac': case 'fan': case 'shower':
      return !!device.power
    case 'cooker': return !!(device.ovenOn || device.heat > 0)
    case 'fridge': return !!(device.open || device.freezerOpen)
    case 'curtains': case 'door': return !!device.open
    case 'lock': return !!device.locked
    case 'doorbell': return !!device.ringing
    case 'sensor': return sensorActive(device)
    case 'switch': return !!devices && device.controls.some((id) => devices[id]?.power)
    case 'hub': return true
    case 'prop':
      switch (device.propKind) {
        case 'phone': return !!device.screen
        case 'remote': return !!devices?.[device.targets]?.power
        case 'pepper': return !!device.grind
        case 'utensils': return !!device.inUse
        default: return false
      }
    default: return false
  }
}

/** Primary click action available for a device (used for object clicks). */
export function getPrimaryAction(device) {
  switch (device?.type) {
    case 'light': return 'Toggle power'
    case 'tv': return 'Toggle power'
    case 'ac': return 'Toggle power'
    case 'fan': return 'Toggle power'
    case 'shower': return device.power ? 'Stop shower' : 'Start shower'
    case 'fridge': return device.open || device.freezerOpen ? 'Close doors' : 'Open doors'
    case 'cooker': return device.ovenOn || device.heat > 0 ? 'Turn off' : 'Turn on'
    case 'curtains': return device.open ? 'Close curtains' : 'Open curtains'
    case 'door': return device.open ? 'Close door' : 'Open door'
    case 'lock': return device.locked ? 'Unlock' : 'Lock'
    case 'doorbell': return 'Ring doorbell'
    case 'sensor': return 'Inspect'
    case 'switch': return 'Toggle switch'
    case 'hub': return 'Open hub controls'
    case 'prop':
      switch (device.propKind) {
        case 'phone': return device.screen ? 'Lock the phone' : 'Wake the phone'
        case 'remote': return `Toggle the ${device.targetLabel || 'device'}`
        case 'pepper': return 'Grind some pepper'
        case 'utensils': return device.inUse ? 'Put back' : 'Pick up'
        default: return 'Inspect'
      }
    default: return 'Select'
  }
}

/** Initial catalogue snapshot, used for a few derived lookups. */
const INITIAL = createInitialDevices()

export const isLightId = (id) => INITIAL[id]?.type === 'light'

/** Every light device id, derived from the catalogue. */
export const LIGHT_IDS = Object.values(INITIAL)
  .filter((d) => d.type === 'light')
  .map((d) => d.id)
