/**
 * AI / backend-ready household facade.
 *
 * A single, renderer-independent interface over the shared store. Nothing in
 * here imports React or THREE, so a future FastAPI bridge, an MCP server or an
 * assistant can drive the exact same state the 3D scene renders, without ever
 * touching the UI:
 *
 *   houseApi.getDevices()            -> every device (plain data)
 *   houseApi.getRoomDevices('kitchen')
 *   houseApi.getDeviceState('fridge')
 *   houseApi.executeAction('fridge', 'toggleDoor')
 *   houseApi.activateScene('bedtime')
 *   houseApi.getSensors()            -> sensor readings only
 *
 * The action vocabulary below is deliberately explicit (verbs, not patches) so
 * an external caller never has to know internal field names like `power` or
 * `open`. Every action funnels through the same store `commit()` the UI uses,
 * including optimistic update + rollback through the device adapter.
 */

import { useRoomStore } from '../store/useRoomStore'
import { ROOM_LIST, ROOMS } from '../config/house'
import { describeDevice, groupForDevice } from '../config/devices'
import { houseEnergyReport, climateReport } from '../config/reports'
import { MODE_LIST, MODE_PATCHES } from '../automation/modes'

/** Device type -> the set of actions an external caller may invoke. */
export const DEVICE_ACTIONS = {
  light: ['turnOn', 'turnOff', 'toggle', 'setBrightness', 'setColor'],
  tv: ['turnOn', 'turnOff', 'toggle', 'setVolume', 'setChannel', 'mute', 'unmute'],
  ac: ['turnOn', 'turnOff', 'toggle', 'setTemperature', 'setMode'],
  fan: ['turnOn', 'turnOff', 'toggle', 'setSpeed'],
  shower: ['turnOn', 'turnOff', 'toggle', 'setTemperature'],
  curtains: ['open', 'close', 'toggle'],
  door: ['open', 'close', 'toggle'],
  lock: ['lock', 'unlock', 'toggle'],
  fridge: ['open', 'close', 'toggleDoor', 'openFreezer', 'closeFreezer', 'toggleFreezer', 'turnOn', 'turnOff', 'setTemperature'],
  cooker: ['turnOn', 'turnOff', 'setHeat', 'setOven'],
  doorbell: ['ring'],
  sensor: ['read', 'set'],
  switch: ['toggle'],
  prop: ['toggle'],
  hub: ['activateScene'],
}

const asPlain = (device, devices) =>
  device ? { ...device, status: describeDevice(device, devices), group: groupForDevice(device) } : null

const store = () => useRoomStore.getState()

/**
 * Translate a high-level action into a concrete state patch + command.
 * Returns null for unknown combinations so callers can fail loudly rather
 * than silently sending a wrong command to real hardware.
 */
function planAction(device, action, params = {}) {
  switch (`${device.type}:${action}`) {
    case 'light:turnOn': return [{ power: true }, 'power.set']
    case 'light:turnOff': return [{ power: false }, 'power.set']
    case 'light:toggle': return [{ power: !device.power }, 'power.set']
    case 'light:setBrightness': return [{ power: true, brightness: clamp01(params.value) }, 'light.set']
    case 'light:setColor': return [{ color: params.value }, 'light.set']

    case 'tv:turnOn': return [{ power: true }, 'power.set']
    case 'tv:turnOff': return [{ power: false }, 'power.set']
    case 'tv:toggle': return [{ power: !device.power }, 'power.set']
    case 'tv:setVolume': return [{ volume: Math.round(clamp01(params.value) * 100) }, 'tv.set']
    case 'tv:setChannel': return [{ channel: params.value }, 'tv.set']
    case 'tv:mute': return [{ muted: true }, 'tv.set']
    case 'tv:unmute': return [{ muted: false }, 'tv.set']

    case 'ac:turnOn': return [{ power: true }, 'power.set']
    case 'ac:turnOff': return [{ power: false }, 'power.set']
    case 'ac:toggle': return [{ power: !device.power }, 'power.set']
    case 'ac:setTemperature': return [{ targetTemp: params.value }, 'ac.set']
    case 'ac:setMode': return [{ mode: params.value }, 'ac.set']

    case 'fan:turnOn': return [{ power: true }, 'power.set']
    case 'fan:turnOff': return [{ power: false }, 'power.set']
    case 'fan:toggle': return [{ power: !device.power }, 'power.set']
    case 'fan:setSpeed': return [{ speed: params.value }, 'fan.set']

    case 'shower:turnOn': return [{ power: true }, 'shower.set']
    case 'shower:turnOff': return [{ power: false }, 'shower.set']
    case 'shower:toggle': return [{ power: !device.power }, 'shower.set']
    case 'shower:setTemperature': return [{ temp: params.value }, 'shower.set']

    case 'curtains:open': return [{ open: true }, 'cover.set']
    case 'curtains:close': return [{ open: false }, 'cover.set']
    case 'curtains:toggle': return [{ open: !device.open }, 'cover.set']

    case 'door:open': return [{ open: true }, 'door.set']
    case 'door:close': return [{ open: false }, 'door.set']
    case 'door:toggle': return [{ open: !device.open }, 'door.set']

    case 'lock:lock': return [{ locked: true }, 'lock.set']
    case 'lock:unlock': return [{ locked: false }, 'lock.set']
    case 'lock:toggle': return [{ locked: !device.locked }, 'lock.set']

    case 'fridge:open': return [{ open: true }, 'fridge.set']
    case 'fridge:close': return [{ open: false }, 'fridge.set']
    case 'fridge:toggleDoor': return [{ open: !device.open }, 'fridge.set']
    case 'fridge:openFreezer': return [{ freezerOpen: true }, 'fridge.set']
    case 'fridge:closeFreezer': return [{ freezerOpen: false }, 'fridge.set']
    case 'fridge:toggleFreezer': return [{ freezerOpen: !device.freezerOpen }, 'fridge.set']
    case 'fridge:turnOn': return [{ power: true }, 'fridge.set']
    case 'fridge:turnOff': return [{ power: false }, 'fridge.set']
    case 'fridge:setTemperature': return [{ targetTemp: params.value }, 'fridge.set']

    case 'cooker:turnOn': return [{ power: true, heat: Math.max(1, device.heat) }, 'cooker.set']
    case 'cooker:turnOff': return [{ power: false, heat: 0, ovenOn: false }, 'cooker.set']
    case 'cooker:setHeat': return [{ heat: params.value, power: params.value > 0 }, 'cooker.set']
    case 'cooker:setOven': return [{ ovenOn: params.value, power: true }, 'cooker.set']

    case 'doorbell:ring': return [{ ringing: true }, 'doorbell.ring']

    case 'sensor:read': return null // read is a no-op, handled by caller
    case 'sensor:set': return [{ value: params.value }, 'sensor.set']

    case 'switch:toggle': return [{ __toggleSwitch: true }, 'switch.set']

    default: return null
  }
}

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0))

export const houseApi = {
  /** Metadata: rooms, scenes and the action vocabulary (for prompts / docs). */
  describe() {
    return {
      rooms: ROOM_LIST.map(({ id, label, x0, x1, z0, z1 }) => ({ id, label, bounds: { x0, x1, z0, z1 } })),
      scenes: MODE_LIST.map(({ id, label, hint }) => ({ id, label, hint })),
      deviceActions: DEVICE_ACTIONS,
      backend: store().backendLabel,
    }
  },

  getDevices() {
    const { devices } = store()
    return Object.values(devices).map((d) => asPlain(d, devices))
  },

  getRoomDevices(roomId) {
    if (!ROOMS[roomId]) return []
    return store().getDevicesInRoom
      ? store().getDevicesInRoom(roomId)
      : this.getDevices().filter((d) => d.room === roomId)
  },

  getDeviceState(id) {
    const { devices } = store()
    return asPlain(devices[id], devices)
  },

  /** Only the simulated sensors (occupancy, water, entry contact). */
  getSensors() {
    return this.getDevices().filter((d) => d.type === 'sensor')
  },

  /** Live energy report (instantaneous load, per-room split, tariff cost). */
  getEnergyReport() {
    return houseEnergyReport(store().devices)
  },

  /** Live climate report (temperature, humidity, AC mode and comfort). */
  getClimateReport() {
    return climateReport(store().room, store().devices)
  },

  /** Both reports plus the running daily tally, for prompts / dashboards. */
  getReport() {
    const { energy } = store()
    return {
      energy: { ...this.getEnergyReport(), ...energy },
      climate: this.getClimateReport(),
    }
  },

  /**
   * Run one high-level action. Resolves once the device adapter acknowledges
   * (or throws, so the caller can surface a real failure).
   */
  async executeAction(id, action, params = {}) {
    const { devices, commit, toggleSwitch, ringDoorbell, handleObjectClick } = store()
    const device = devices[id]
    if (!device) throw new Error(`Unknown device "${id}"`)

    if (action === 'describe') return asPlain(device, devices)

    if (device.type === 'switch' && action === 'toggle') {
      await toggleSwitch(id)
      return asPlain(store().devices[id], store().devices)
    }

    if (device.type === 'prop' && action === 'toggle') {
      await store().handlePropClick(id)
      return asPlain(store().devices[id], store().devices)
    }

    const plan = planAction(device, action, params)
    if (!plan) {
      throw new Error(`Action "${action}" is not valid for a ${device.type}`)
    }
    const [patch, command] = plan
    await commit(id, patch, command)

    // doorbell rings settle back on their own, reuse the shared helper
    if (command === 'doorbell.ring') ringDoorbell(id)

    // keep the entry contact in step with the front door
    if (id === 'mainDoor' && store().devices.entrySensor) {
      await commit('entrySensor', { value: patch.open ? 'open' : 'closed' }, 'sensor.set', { keepMode: true })
    }
    return asPlain(store().devices[id], store().devices)
  },

  /** Activate a household scene by id (home | movie | bedtime | away | morning). */
  async activateScene(sceneId) {
    if (!MODE_PATCHES[sceneId]) throw new Error(`Unknown scene "${sceneId}"`)
    await store().applyMode(sceneId)
    return { scene: sceneId, active: store().activeMode }
  },

  /** Apply an arbitrary patch to a single device (escape hatch for bridges). */
  async patchDevice(id, patch) {
    const device = store().devices[id]
    if (!device) throw new Error(`Unknown device "${id}"`)
    await store().commit(id, patch, `${device.type}.set`)
    return asPlain(store().devices[id], store().devices)
  },

  /** Current room navigation state (for headless / voice room switching). */
  navigate(target) {
    if (target === 'overview') store().setOverview()
    else if (target === 'floorplan') store().setFloorPlan()
    else if (ROOMS[target]) store().goToRoom(target)
    else throw new Error(`Unknown navigation target "${target}"`)
    return { view: store().view, room: store().currentRoom }
  },
}

/**
 * Read-only snapshot suitable for logging or sending to an LLM as context.
 * Pure: depends only on the current store state.
 */
export function buildHouseSnapshot() {
  const { devices, currentRoom, view, activeMode, room, energy } = store()
  return {
    currentRoom,
    view,
    activeMode,
    environment: { ...room },
    energy: { ...houseEnergyReport(devices), ...energy },
    climate: climateReport(room, devices),
    rooms: ROOM_LIST.map((r) => ({
      id: r.id,
      label: r.label,
      devices: Object.values(devices)
        .filter((d) => d.room === r.id)
        .map((d) => ({ id: d.id, name: d.name, type: d.type, status: describeDevice(d, devices) })),
    })),
  }
}

export default houseApi
