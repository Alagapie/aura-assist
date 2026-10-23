/**
 * Energy and climate reporting — pure, renderer-free maths.
 *
 * Everything here depends only on plain device objects and the environment
 * reading, so the status bar, the reports overlay, the AI facade and the
 * automated tests all describe the *same* numbers. Nothing imports React or
 * THREE.
 *
 * The energy model is deliberately simple but honest: each device contributes a
 * plausible wattage based on its current state (a lamp scales with brightness,
 * a fan with its speed, the cooker with its hob level). The live total is
 * integrated over time by the store's climate tick into kWh for the day, which
 * is what the Reports overlay shows.
 */

import { ROOM_LIST } from './house.js'

/** A representative domestic tariff. Currency is a display detail only. */
export const TARIFF = { currency: '£', perKwh: 0.27 }

/** Rated / typical draw in watts for each modelled device state. */
export const POWER_W = {
  light: 9, // per lamp at full brightness
  fan: { 1: 45, 2: 60, 3: 75 },
  tv: { on: 90, muted: 82, standby: 6 },
  ac: { cool: 900, heat: 1100, dry: 700, auto: 950, fan: 70 },
  fridge: { running: 150, open: 210 },
  cooker: { hobPerLevel: 700, oven: 2200 },
  shower: 8500, // instantaneous electric water heater
  standby: { lock: 1.2, sensor: 0.6, switch: 0.4, doorbell: 0.5, hub: 3, phone: 6 },
}

/** Clamp a number into 0..1 (safe against undefined). */
const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0))

/**
 * How many watts a single device is drawing right now.
 * Always a finite, non-negative number — devices that draw nothing (a curtain
 * motor between moves, a closed door) report 0.
 */
export function devicePower(device) {
  if (!device) return 0
  switch (device.type) {
    case 'light':
      return device.power ? Math.round(POWER_W.light * clamp01(device.brightness)) : 0
    case 'tv':
      if (!device.power) return POWER_W.tv.standby
      return device.muted ? POWER_W.tv.muted : POWER_W.tv.on
    case 'ac':
      return device.power ? (POWER_W.ac[device.mode] ?? POWER_W.ac.cool) : 0
    case 'fan':
      return device.power ? (POWER_W.fan[device.speed] ?? POWER_W.fan[2]) : 0
    case 'fridge':
      return device.power ? (device.open || device.freezerOpen ? POWER_W.fridge.open : POWER_W.fridge.running) : 0
    case 'cooker': {
      const hob = device.power && device.heat > 0 ? POWER_W.cooker.hobPerLevel * device.heat : 0
      const oven = device.ovenOn ? POWER_W.cooker.oven : 0
      return hob + oven
    }
    case 'shower':
      return device.power ? POWER_W.shower : 0
    case 'lock':
      return POWER_W.standby.lock
    case 'sensor':
      return POWER_W.standby.sensor
    case 'switch':
      return POWER_W.standby.switch
    case 'doorbell':
      return device.ringing ? 3 : POWER_W.standby.doorbell
    case 'hub':
      return POWER_W.standby.hub
    case 'prop':
      return device.propKind === 'phone' && device.charging ? POWER_W.standby.phone : 0
    case 'curtains':
    case 'door':
    default:
      return 0
  }
}

/** Human-friendly wattage, e.g. 940 -> "940 W", 4200 -> "4.2 kW". */
export function formatWatts(watts) {
  const w = Math.max(0, Math.round(watts))
  if (w >= 1000) return `${(w / 1000).toFixed(1)} kW`
  return `${w} W`
}

/** Human-friendly energy, e.g. 0.42 -> "0.42 kWh". */
export function formatKwh(kwh) {
  return `${Math.max(0, kwh).toFixed(kwh < 1 ? 2 : 1)} kWh`
}

/** Money for the configured tariff. */
export function formatCost(kwh, tariff = TARIFF) {
  const value = Math.max(0, kwh) * tariff.perKwh
  return `${tariff.currency}${value.toFixed(value < 1 ? 3 : 2)}`
}

/**
 * Integrate a live load into an energy accumulator.
 * `seconds` is the wall-clock slice represented by this step.
 */
export function accumulateEnergy(energy, totalWatts, seconds, peakWatts = totalWatts) {
  const kwh = (energy?.kwhToday || 0) + (Math.max(0, totalWatts) / 1000) * (Math.max(0, seconds) / 3600)
  return {
    kwhToday: kwh,
    peakWatts: Math.max(energy?.peakWatts || 0, peakWatts, 0),
  }
}

/**
 * Whole-house energy report.
 *
 * @returns {{
 *   totalWatts:number, activeCount:number, deviceCount:number,
 *   costPerHour:number, tariff:object,
 *   byRoom:Array<{id,label,watts,active,devices}>,
 *   top:Array<{id,name,room,type,watts,share}>
 * }}
 */
export function houseEnergyReport(devices) {
  const list = Object.values(devices || {})
  const perDevice = list.map((d) => ({ device: d, watts: devicePower(d) }))
  const totalWatts = perDevice.reduce((sum, d) => sum + d.watts, 0)

  const byRoom = ROOM_LIST.map((room) => {
    const inRoom = perDevice.filter((d) => d.device.room === room.id)
    const watts = inRoom.reduce((sum, d) => sum + d.watts, 0)
    const active = inRoom.filter((d) => d.watts > 0)
    return {
      id: room.id,
      label: room.label,
      short: room.short,
      watts,
      active: active.length,
      devices: inRoom.length,
      share: totalWatts > 0 ? watts / totalWatts : 0,
    }
  })

  const top = perDevice
    .filter((d) => d.watts > 0)
    .sort((a, b) => b.watts - a.watts)
    .slice(0, 5)
    .map((d) => ({
      id: d.device.id,
      name: d.device.name,
      room: d.device.room,
      type: d.device.type,
      watts: d.watts,
      share: totalWatts > 0 ? d.watts / totalWatts : 0,
    }))

  return {
    totalWatts,
    activeCount: perDevice.filter((d) => d.watts > 0).length,
    deviceCount: list.length,
    costPerHour: (totalWatts / 1000) * TARIFF.perKwh,
    tariff: TARIFF,
    byRoom,
    top,
  }
}

/**
 * Climate report: what the conditioned spaces are doing and how comfortable
 * they are. Reads the shared environment reading plus every AC unit.
 */
export function climateReport(room, devices) {
  const acs = Object.values(devices || {}).filter((d) => d.type === 'ac')
  const running = acs.filter((a) => a.power)
  const lead = running[0] || null

  const temp = room?.temp ?? 0
  const humidity = room?.humidity ?? 0
  const ambientTemp = room?.ambientTemp ?? temp

  const comfort = temp >= 20 && temp <= 24.5
    ? (humidity > 58 ? 'Close' : 'Comfortable')
    : temp < 20 ? 'Cool' : temp > 27 ? 'Hot' : 'Warm'

  const mode = lead?.mode ?? null
  let trend = 'Stable'
  if (mode === 'heat') trend = 'Warming'
  else if (mode === 'cool') trend = 'Cooling'
  else if (mode === 'dry') trend = 'Drying'
  else if (mode === 'fan') trend = 'Circulating'
  else if (temp < ambientTemp - 0.2) trend = 'Warming' // drifting back to ambient
  else if (temp > ambientTemp + 0.2) trend = 'Cooling'

  return {
    temp,
    humidity,
    ambientTemp,
    running: running.length,
    total: acs.length,
    target: lead?.targetTemp ?? null,
    mode,
    trend,
    comfort,
    heating: mode === 'heat',
    cooling: mode === 'cool',
  }
}
