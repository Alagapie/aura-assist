import { create } from 'zustand'
import { deviceService } from '../services/deviceService'
import { createInitialDevices, nextSensorValue } from '../config/devices'
import { LIGHT_IDS, MODE_LIST, MODE_PATCHES } from '../automation/modes'
import { ROOMS, roomViewCount } from '../config/house'
import { houseEnergyReport, accumulateEnergy } from '../config/reports'

/**
 * Single source of truth for the whole application.
 *
 * Both the 3D objects and every UI panel read from and write to this store, so
 * a change made by clicking a lamp in the scene instantly appears in the device
 * list, in the contextual panel and in the status bar (and vice versa).
 *
 * `commit()` applies a patch optimistically and then awaits the device service.
 * If the (future) real backend rejects the command, the state is rolled back.
 */

let logId = 0

/**
 * Scene application queue.
 *
 * Applying a scene means committing a batch of device commands, and every
 * command has real latency. Without serialisation, two scenes started in quick
 * succession would interleave and leave a mixed state. Instead:
 *   - at most one scene runs at a time,
 *   - only the most recently requested scene stays queued (last request wins),
 *   - a manual command (commit without `keepMode`) cancels queued and
 *     in-flight scenes, so a user's click is never overridden by a stale scene.
 */
let sceneQueue = null
let sceneRunning = false
let sceneGeneration = 0
let sceneChain = Promise.resolve()

const cancelPendingScenes = () => {
  sceneGeneration += 1
  sceneQueue = null
}

const startSceneDrain = () => {
  sceneRunning = true
  sceneChain = (async () => {
    try {
      while (sceneQueue) {
        const generation = sceneGeneration
        const next = sceneQueue
        sceneQueue = null
        await next(() => generation !== sceneGeneration)
      }
    } finally {
      sceneRunning = false
    }
  })()
}

/** Queue `task`, a function that receives an `isCancelled()` probe. */
const enqueueScene = (task) => {
  sceneQueue = task
  if (!sceneRunning) startSceneDrain()
  return sceneChain
}

/**
 * Devices with a local command in flight.
 *
 * Snapshots arriving from the server are skipped for these ids, so a slow echo
 * of an earlier command can never overwrite a newer optimistic click. The next
 * snapshot after the command settles carries the authoritative value anyway.
 */
const pendingLocal = new Map()

const markPending = (id, delta) => {
  const next = (pendingLocal.get(id) || 0) + delta
  if (next > 0) pendingLocal.set(id, next)
  else pendingLocal.delete(id)
}

/** Fields that describe a device's identity/rendering, not its live state. */
const IDENTITY_KEYS = new Set(['id', 'type', 'room', 'name', 'lightKind', 'propKind'])

const commandFor = (device) => {
  switch (device?.type) {
    case 'light': return 'light.set'
    case 'curtains': return 'cover.set'
    case 'door': return 'door.set'
    case 'switch': return 'switch.set'
    case 'hub': return 'scene.activate'
    case 'lock': return 'lock.set'
    case 'doorbell': return 'doorbell.ring'
    case 'fridge': return 'fridge.set'
    case 'cooker': return 'cooker.set'
    case 'shower': return 'shower.set'
    case 'sensor': return 'sensor.set'
    default: return `${device?.type}.set`
  }
}

const describeCommand = (command, payload = {}) => {
  switch (command) {
    case 'power.set':
      return payload.power ? 'power on' : 'power off'
    case 'light.set':
      return payload.power === false
        ? 'light off'
        : `brightness ${Math.round((payload.brightness ?? 1) * 100)}%`
    case 'tv.set':
      if (payload.channel !== undefined) return `channel ${payload.channel}`
      if (payload.volume !== undefined) return `volume ${payload.volume}%`
      if (payload.muted !== undefined) return payload.muted ? 'muted' : 'unmuted'
      return payload.power ? 'power on' : 'power off'
    case 'ac.set':
      if (payload.targetTemp !== undefined) return `target ${payload.targetTemp}°C`
      if (payload.mode !== undefined) return `mode ${payload.mode}`
      return payload.power ? 'power on' : 'power off'
    case 'fan.set':
      if (payload.speed !== undefined) return `speed ${payload.speed}`
      if (payload.oscillate !== undefined) return payload.oscillate ? 'oscillating' : 'fixed'
      return payload.power ? 'power on' : 'power off'
    case 'cover.set':
      return payload.open ? 'open' : 'close'
    case 'door.set':
      return payload.open ? 'open' : 'close'
    case 'lock.set':
      return payload.locked ? 'lock' : 'unlock'
    case 'doorbell.ring':
      return 'rang'
    case 'fridge.set':
      if (payload.open !== undefined) return payload.open ? 'fridge door opened' : 'fridge door closed'
      if (payload.freezerOpen !== undefined) return payload.freezerOpen ? 'freezer opened' : 'freezer closed'
      if (payload.targetTemp !== undefined) return `set to ${payload.targetTemp}°C`
      return payload.power ? 'on' : 'off'
    case 'cooker.set':
      if (payload.heat !== undefined) return `hob level ${payload.heat}`
      if (payload.ovenOn !== undefined) return payload.ovenOn ? 'oven on' : 'oven off'
      return payload.power ? 'on' : 'off'
    case 'shower.set':
      if (payload.temp !== undefined) return `${payload.temp}°C`
      return payload.power ? 'water on' : 'water off'
    case 'sensor.set':
      return `value ${payload.value}`
    case 'scene.activate':
      return 'scene applied'
    default:
      return 'updated'
  }
}

export const useRoomStore = create((set, get) => ({
  devices: createInitialDevices(),
  selectedId: null,
  hoveredId: null,
  activeMode: 'Manual',
  cameraMode: 'orbit', // 'orbit' | 'walk'
  walkLocked: false,
  viewResetKey: 0,
  sidebarOpen: true,
  floorPlanOpen: false,
  reportsOpen: false,
  room: { temp: 26.4, humidity: 46, ambientTemp: 27 },
  // Running energy tally for "today". Seeded non-zero so the report reads like
  // a day already in progress; the climate tick integrates the live load into it.
  energy: { kwhToday: 0.42, peakWatts: 0 },
  log: [],
  lastScene: null,
  backendLabel: deviceService.label,

  /* --------------------------- Household navigation ---------------------- */
  // `view` is 'room' | 'overview' | 'floorplan'. `currentRoom` is the room the
  // camera is framed on (kept even in overview so the UI can show context).
  currentRoom: 'living',
  view: 'room',
  roomView: 0, // index into the current room's `views` (see config/house.js)
  // When true, an orbit *room* view keeps the camera inside that room so orbiting
  // never swings out through the rest of the house. Turn it off (or use Overview)
  // to pull back to the whole-house dollhouse.
  roomIsolation: true,
  cameraView: { mode: 'room', roomId: 'living', viewIndex: 0, nonce: 0 },
  // Bumped by the on-screen zoom buttons / keyboard shortcuts; the camera rig
  // watches `nonce` and nudges the damped zoom target by `dir`.
  zoomTick: { dir: 0, nonce: 0 },

  goToRoom: (roomId) => {
    if (!ROOMS[roomId]) return
    set((s) => ({
      currentRoom: roomId,
      view: 'room',
      roomView: 0,
      cameraView: { mode: 'room', roomId, viewIndex: 0, nonce: s.cameraView.nonce + 1 },
    }))
  },
  /** Jump to viewpoint `index` of the current room (wraps). */
  setRoomView: (index) =>
    set((s) => ({
      view: 'room',
      roomView: index,
      cameraView: { mode: 'room', roomId: s.currentRoom, viewIndex: index, nonce: s.cameraView.nonce + 1 },
    })),
  cycleRoomView: (step = 1) =>
    set((s) => {
      const count = roomViewCount(s.currentRoom)
      const index = ((s.roomView + step) % count + count) % count
      return {
        view: 'room',
        roomView: index,
        cameraView: { mode: 'room', roomId: s.currentRoom, viewIndex: index, nonce: s.cameraView.nonce + 1 },
      }
    }),
  /** Frame the whole current room (the viewpoint flagged `wide`). */
  fitRoom: () =>
    set((s) => {
      const views = ROOMS[s.currentRoom]?.views || []
      const found = views.findIndex((v) => v.wide)
      const index = found >= 0 ? found : 0
      return {
        view: 'room',
        roomView: index,
        cameraView: { mode: 'room', roomId: s.currentRoom, viewIndex: index, nonce: s.cameraView.nonce + 1 },
      }
    }),
  /** Nudge the damped zoom (dir > 0 zooms in). Used by the +/- buttons. */
  zoomBy: (dir) => set((s) => ({ zoomTick: { dir, nonce: s.zoomTick.nonce + 1 } })),
  /** Toggle keeping the orbit camera contained inside the current room. */
  toggleRoomIsolation: () => set((s) => ({ roomIsolation: !s.roomIsolation })),
  setOverview: () =>
    set((s) => ({
      view: 'overview',
      cameraView: { mode: 'overview', roomId: s.currentRoom, viewIndex: 0, nonce: s.cameraView.nonce + 1 },
    })),
  setFloorPlan: () =>
    set((s) => ({
      view: 'floorplan',
      cameraView: { mode: 'floorplan', roomId: s.currentRoom, viewIndex: 0, nonce: s.cameraView.nonce + 1 },
    })),

  /**
   * Change only the navigation *label* the UI shows, without moving the camera.
   * The orbit rig uses this to keep the room switcher in sync while the user
   * scrolls continuously between a room close-up and the whole-house view;
   * unlike goToRoom/setOverview it must not bump the nonce, or it would start a
   * fly-in and fight the scroll.
   */
  setView: (view) => set((s) => (s.view === view ? s : { view })),

  /** Toggle the interactive 2D floor-plan overlay (independent of the camera). */
  toggleFloorPlan: () => set((s) => ({ floorPlanOpen: !s.floorPlanOpen })),
  closeFloorPlan: () => set({ floorPlanOpen: false }),

  /** Toggle the energy / climate reports overlay. */
  toggleReports: () => set((s) => ({ reportsOpen: !s.reportsOpen })),
  closeReports: () => set({ reportsOpen: false }),

  /**
   * Record which room the walker is physically in without moving the camera.
   * Used by the first-person mode so the UI (and the next orbit view) follow
   * the player from room to room.
   */
  setCurrentRoom: (roomId) =>
    set((s) => (ROOMS[roomId] && s.currentRoom !== roomId ? { currentRoom: roomId } : s)),

  /* ------------------------------- UI state ------------------------------ */
  select: (id) => set((s) => (s.selectedId === id ? s : { selectedId: id })),
  clearSelection: () => set((s) => (s.selectedId ? { selectedId: null } : s)),
  setHovered: (id) => set((s) => (s.hoveredId === id ? s : { hoveredId: id })),
  /**
   * Switch between the orbit rig and the first-person walkthrough. Leaving walk
   * mode re-frames the camera on whichever room the player ended up in.
   */
  setCameraMode: (cameraMode) =>
    set((s) => (cameraMode === 'orbit'
      ? { cameraMode, view: 'room', cameraView: { mode: 'room', roomId: s.currentRoom, viewIndex: s.roomView, nonce: s.cameraView.nonce + 1 } }
      : { cameraMode })),
  setWalkLocked: (walkLocked) => set({ walkLocked }),
  resetView: () =>
    set((s) => ({
      cameraMode: 'orbit',
      view: 'room',
      roomView: 0,
      viewResetKey: s.viewResetKey + 1,
      cameraView: { mode: 'room', roomId: s.currentRoom, viewIndex: 0, nonce: s.cameraView.nonce + 1 },
    })),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  pushLog: (entry) =>
    set((s) => ({
      log: [{ id: ++logId, at: Date.now(), level: 'info', ...entry }, ...s.log].slice(0, 24),
    })),

  /** Every device that belongs to one room (used by the UI and the AI facade). */
  getDevicesInRoom: (roomId) => Object.values(get().devices).filter((d) => d.room === roomId),

  /* --------------------------- Device commands --------------------------- */
  /**
   * Apply `patch` to a device optimistically, then notify the device backend.
   * `options.keepMode` leaves the active automation mode untouched (used while
   * a scene is being applied).
   */
  commit: async (id, patch, command = 'state.set', options = {}) => {
    const previous = get().devices[id]
    if (!previous) return
    // a deliberate user command takes priority over any pending scene
    if (!options.keepMode) cancelPendingScenes()
    const next = { ...previous, ...patch }
    set((s) => ({
      devices: { ...s.devices, [id]: next },
      activeMode: options.keepMode ? s.activeMode : 'Manual',
    }))

    markPending(id, +1)
    try {
      await deviceService.send(id, command, { ...patch })
      get().pushLog({
        level: 'ok',
        text: `${previous.name} · ${describeCommand(command, patch)}`,
      })
    } catch (error) {
      set((s) => ({ devices: { ...s.devices, [id]: previous } }))
      get().pushLog({ level: 'error', text: `${previous.name} · command failed (${error.message})` })
    } finally {
      markPending(id, -1)
    }
  },

  /**
   * Apply a full snapshot received from the AuraAssist server (SSE).
   *
   * Only live state fields are merged - identity and rendering fields stay
   * local - and devices with a command in flight are skipped, so our own
   * optimistic writes always win over their echo.
   */
  applyAuraSnapshot: (snapshot) => {
    const incoming = snapshot?.devices
    if (!Array.isArray(incoming)) return
    set((s) => {
      let devices = null
      for (const remote of incoming) {
        if (!remote?.id || pendingLocal.get(remote.id)) continue
        const local = s.devices[remote.id]
        if (!local) continue
        let merged = null
        for (const [key, value] of Object.entries(remote)) {
          if (IDENTITY_KEYS.has(key) || local[key] === value) continue
          if (!merged) merged = { ...local }
          merged[key] = value
        }
        if (!merged) continue
        if (!devices) devices = { ...s.devices }
        devices[remote.id] = merged
      }
      return devices ? { devices } : {}
    })
  },

  /** 'connecting' | 'online' | 'reconnecting' - the link to the MCP server. */
  bridgeStatus: 'connecting',
  setBridgeStatus: (status) => set({ bridgeStatus: status }),

  /** Which AuraAssist server we are pointed at (see services/auraConnection). */
  serverUrl: '',
  serverHost: '',
  serverEngine: null,
  discovery: 'idle', // idle | searching | found | failed
  setConnection: (patch) => set(patch),

  /** Click on a 3D object: select it and run its primary action. */
  handleObjectClick: (id) => {
    const device = get().devices[id]
    if (!device) return
    get().select(id)
    const { commit } = get()
    switch (device.type) {
      case 'light':
      case 'tv':
      case 'ac':
      case 'fan':
        return commit(id, { power: !device.power }, 'power.set')
      case 'curtains':
        return commit(id, { open: !device.open }, 'cover.set')
      case 'door':
        commit(id, { open: !device.open }, 'door.set')
        // The entry contact sensor mirrors the front door, like a real reed switch.
        if (id === 'mainDoor' && get().devices.entrySensor) {
          commit('entrySensor', { value: !device.open ? 'open' : 'closed' }, 'sensor.set', { keepMode: true })
        }
        return
      case 'lock':
        return commit(id, { locked: !device.locked }, 'lock.set')
      case 'doorbell':
        return get().ringDoorbell(id)
      case 'fridge': {
        const anyOpen = device.open || device.freezerOpen
        return commit(id, { open: !anyOpen, freezerOpen: !anyOpen }, 'fridge.set')
      }
      case 'cooker': {
        const on = device.heat > 0 || device.ovenOn
        return commit(id, on ? { power: false, heat: 0, ovenOn: false } : { power: true, heat: 1 }, 'cooker.set')
      }
      case 'shower':
        return commit(id, { power: !device.power }, 'shower.set')
      case 'sensor':
        return get().pulseSensor(id)
      case 'switch':
        return get().toggleSwitch(id)
      case 'prop':
        return get().handlePropClick(id)
      default:
        return undefined // hub: selection only, panel opens with scene controls
    }
  },

  /** Doorbell: flashes "ringing" then settles back to idle. */
  ringDoorbell: async (id = 'doorbell') => {
    const { devices, commit } = get()
    if (!devices[id]) return
    await commit(id, { ringing: true }, 'doorbell.ring')
    get().pushLog({ level: 'info', text: 'Doorbell · ding-dong at the front door' })
    setTimeout(() => {
      if (get().devices[id]?.ringing) {
        get().commit(id, { ringing: false }, 'doorbell.ring', { keepMode: true })
      }
    }, 2600)
  },

  /** Simulated sensors toggle between their two readings on click. */
  pulseSensor: async (id) => {
    const sensor = get().devices[id]
    if (!sensor) return
    const nextValue =
      sensor.sensorKind === 'entry'
        ? get().devices.mainDoor?.open ? 'closed' : 'open'
        : nextSensorValue(sensor)
    await commit(id, { value: nextValue }, 'sensor.set')
  },

  /** Wall switches drive the light group they are wired to. */
  toggleSwitch: async (switchId) => {    const { devices, commit } = get()
    const wall = devices[switchId]
    if (!wall) return
    const isOn = wall.controls.some((id) => devices[id]?.power)
    const target = !isOn
    for (const lightId of wall.controls) {
      const light = devices[lightId]
      if (!light) continue
      await commit(lightId, {
        power: target,
        brightness: target ? Math.max(light.brightness, 0.6) : light.brightness,
        color: light.color,
      }, 'light.set')
    }
  },

  /**
   * Small handheld props. A remote does not hold state of its own: pressing it
   * toggles the device it is paired with (`targets`), which keeps the remote and
   * the appliance in perfect sync.
   */
  handlePropClick: async (id) => {
    const { devices, commit } = get()
    const prop = devices[id]
    if (!prop || prop.type !== 'prop') return undefined
    switch (prop.propKind) {
      case 'phone':
        return commit(id, { screen: !prop.screen }, 'prop.set')
      case 'remote': {
        const target = devices[prop.targets]
        if (!target) return undefined
        const command = target.type === 'ac' ? 'ac.set' : 'power.set'
        return commit(prop.targets, { power: !target.power }, command)
      }
      case 'pepper':
        return get().grindPepper(id)
      case 'utensils':
        return commit(id, { inUse: !prop.inUse }, 'prop.set')
      default:
        return undefined
    }
  },

  /** Grind a little pepper: consumes a sliver of the mill and flashes "grinding". */
  grindPepper: async (id) => {
    const { devices, commit } = get()
    const mill = devices[id]
    if (!mill) return
    const level = Math.max(0.05, (mill.level ?? 1) - 0.06)
    await commit(id, { grind: true, level }, 'prop.set')
    get().pushLog({ level: 'info', text: `${mill.name} · freshly ground pepper` })
    setTimeout(() => {
      if (get().devices[id]?.grind) get().commit(id, { grind: false }, 'prop.set', { keepMode: true })
    }, 1200)
  },

  /* ------------------------------ Master ops ----------------------------- */
  allLightsOff: () => {
    set({ activeMode: 'Manual' })
    return enqueueScene(async (isCancelled) => {
      for (const id of LIGHT_IDS) {
        if (isCancelled()) return
        if (get().devices[id]?.power !== false) await get().commit(id, { power: false }, 'light.set', { keepMode: true })
      }
      get().pushLog({ level: 'info', text: 'Master control · all lights off' })
    })
  },

  allOff: () => {
    set({ activeMode: 'Manual' })
    return enqueueScene(async (isCancelled) => {
      for (const id of ['tv', 'ac', 'fan', ...LIGHT_IDS]) {
        if (isCancelled()) return
        if (get().devices[id]?.power !== false) await get().commit(id, { power: false }, 'power.set', { keepMode: true })
      }
      get().pushLog({ level: 'info', text: 'Master control · everything off' })
    })
  },

  /** Apply an automation scene through the very same commit path. */
  applyMode: (modeId) => {
    const patches = MODE_PATCHES[modeId]
    const mode = MODE_LIST.find((m) => m.id === modeId)
    if (!patches || !mode) return Promise.resolve()
    set({ activeMode: mode.label, lastScene: null })

    return enqueueScene(async (isCancelled) => {
      const touched = new Set()
      for (const [deviceId, patch] of Object.entries(patches)) {
        if (isCancelled()) {
          get().pushLog({ level: 'info', text: `${mode.label} superseded` })
          return
        }
        const device = get().devices[deviceId]
        if (!device) continue
        touched.add(deviceId)
        await get().commit(deviceId, patch, commandFor(device), { keepMode: true })
      }
      const rooms = new Set([...touched].map((id) => get().devices[id]?.room).filter(Boolean))
      set({
        lastScene: {
          id: modeId, label: mode.label, devices: touched.size, rooms: rooms.size, at: Date.now(),
        },
      })
      get().pushLog({ level: 'info', text: `${mode.label} activated · ${touched.size} devices in ${rooms.size} rooms` })
    })
  },

  /* --------------------------- Climate simulator ------------------------- */
  /** Simple thermal drift so the status bar shows believable conditions. */
  tick: () => {
    const { devices, room, energy } = get()
    const ac = devices.ac
    const target = ac?.power ? (ac.mode === 'fan' ? room.ambientTemp : ac.targetTemp) : room.ambientTemp
    const rate = ac?.power ? 0.12 : 0.03
    const temp = room.temp + (target - room.temp) * rate
    // Integrate the live household load into today's energy tally. The tick runs
    // every 2 s (see App.jsx), so each step represents two seconds of draw.
    const totalWatts = houseEnergyReport(devices).totalWatts
    set({
      room: {
        ...room,
        temp: Math.round(temp * 10) / 10,
        humidity: Math.min(62, Math.max(34, room.humidity + (Math.random() - 0.5) * 0.6)),
      },
      energy: accumulateEnergy(energy, totalWatts, 2),
    })
  },
}))

export const useDevice = (id) => useRoomStore((s) => s.devices[id])
