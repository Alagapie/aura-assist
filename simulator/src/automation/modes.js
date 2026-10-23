/**
 * Household automation scenes.
 *
 * A scene is nothing more than a batch patch applied to the same device state
 * that the 3D scene and every control panel render, so all surfaces stay in
 * sync automatically. Scenes are cross-room: a single "Bedtime" patch touches
 * the bedroom, the living room and the hallway at once.
 *
 * A patch maps deviceId -> partial device state. Any device not mentioned keeps
 * its current value, which is also the exclusion mechanism: a user who changes
 * a device after a scene runs is simply not overruled (the scene queue is
 * cancelled by any manual command, see useRoomStore).
 *
 * Safety note: no scene ever *unlocks* the front door or powers down the
 * fridge. Morning closes the front door but deliberately leaves the lock
 * untouched so the user stays in control of access.
 */

import { LIGHT_IDS } from '../config/devices.js'

export { LIGHT_IDS }

export const MODE_LIST = [
  { id: 'home', label: 'Home Mode', icon: 'home', hint: 'Normal state: common lights on, doors closed' },
  { id: 'movie', label: 'Movie Mode', icon: 'film', hint: 'Living lights dim, TV on, curtains shut' },
  { id: 'bedtime', label: 'Bedtime', icon: 'moon', hint: 'Common lights off, bedroom low, AC to 23°C' },
  { id: 'away', label: 'Away Mode', icon: 'briefcase', hint: 'Appliances off, every door closed, front locked' },
  { id: 'morning', label: 'Morning', icon: 'sun', hint: 'Curtains open, kitchen + bathroom warm' },
]

const patchMany = (ids, p) => Object.fromEntries(ids.map((id) => [id, { ...p }]))

/** Every interior + entry door, closed as one group. */
const ALL_DOORS = [
  'entryDoor', 'interiorDoor', 'bedroomDoor', 'hallKitchenDoor',
  'bathDoorKitchen', 'bathDoorBedroom', 'mainDoor',
]
const closeAllDoors = () => patchMany(ALL_DOORS, { open: false })

const LIVING_LIGHTS = ['ceilingLightA', 'ceilingLightB', 'sconceLeft', 'sconceRight', 'tableLamp', 'floorLamp']
const BEDROOM_LIGHTS = ['bedroomLight', 'bedLampLeft', 'bedLampRight']
const BATH_LIGHTS = ['bathroomLight', 'mirrorLight']

export const MODE_PATCHES = {
  /* Restore a configurable, sane normal household state. */
  home: {
    hallLight: { power: true, brightness: 0.8, color: '#ffd9a0' },
    porchLight: { power: false },
    kitchenLight: { power: true, brightness: 0.9, color: '#fff2dd' },
    kitchenStrip: { power: false },
    tv: { power: false },
    ac: { power: false },
    bedroomAC: { power: false },
    fan: { power: false },
    rangeHood: { power: false },
    shower: { power: false },
    bathFan: { power: false },
    cooker: { power: false, heat: 0, ovenOn: false },
    curtains: { open: true },
    bedroomCurtains: { open: true },
    fridge: { open: false, freezerOpen: false },
    doorLock: { locked: true },
    doorbell: { ringing: false },
    ...closeAllDoors(),
    ...patchMany(LIVING_LIGHTS, { power: true, brightness: 0.8, color: '#ffd9a0' }),
    ...patchMany(BEDROOM_LIGHTS, { power: false }),
    ...patchMany(BATH_LIGHTS, { power: false }),
  },

  /* Dim the living room, start the TV, shut the curtains, quiet the rest. */
  movie: {
    tv: { power: true, volume: 30, channel: 3, muted: false },
    curtains: { open: false },
    hallLight: { power: true, brightness: 0.25, color: '#ffb066' },
    porchLight: { power: false },
    ceilingLightA: { power: true, brightness: 0.12, color: '#ff9a5c' },
    ceilingLightB: { power: true, brightness: 0.1, color: '#ff9a5c' },
    sconceLeft: { power: true, brightness: 0.14, color: '#ff8f52' },
    sconceRight: { power: true, brightness: 0.14, color: '#ff8f52' },
    tableLamp: { power: true, brightness: 0.18, color: '#ffb066' },
    floorLamp: { power: false },
    kitchenLight: { power: false },
    kitchenStrip: { power: false },
    ...patchMany(BEDROOM_LIGHTS, { power: false }),
    ...patchMany(BATH_LIGHTS, { power: false }),
  },

  /* Wind down: common areas dark, bedroom soft, bedroom AC comfortable. */
  bedtime: {
    tv: { power: false },
    fan: { power: false },
    rangeHood: { power: false },
    shower: { power: false },
    bathFan: { power: false },
    cooker: { power: false, heat: 0, ovenOn: false },
    curtains: { open: false },
    bedroomCurtains: { open: false },
    ...closeAllDoors(),
    doorLock: { locked: true },
    ac: { power: false },
    bedroomAC: { power: true, targetTemp: 23, mode: 'cool' },
    hallLight: { power: false },
    kitchenLight: { power: false },
    kitchenStrip: { power: false },
    porchLight: { power: false },
    ...patchMany(BATH_LIGHTS, { power: false }),
    bedroomLight: { power: true, brightness: 0.15, color: '#ffb066' },
    bedLampLeft: { power: true, brightness: 0.2, color: '#ffc98a' },
    bedLampRight: { power: false },
    ...patchMany(['ceilingLightA', 'ceilingLightB', 'sconceLeft', 'sconceRight', 'floorLamp'], { power: false }),
    tableLamp: { power: true, brightness: 0.12, color: '#ffb066' },
  },

  /* Leave the house: lights and appliances off, doors shut, front locked. */
  away: {
    tv: { power: false },
    ac: { power: false },
    bedroomAC: { power: false },
    fan: { power: false },
    rangeHood: { power: false },
    shower: { power: false },
    bathFan: { power: false },
    cooker: { power: false, heat: 0, ovenOn: false },
    fridge: { open: false, freezerOpen: false },
    curtains: { open: true },
    bedroomCurtains: { open: true },
    ...closeAllDoors(),
    doorLock: { locked: true },
    doorbell: { ringing: false },
    ...patchMany(LIGHT_IDS, { power: false }),
  },

  /* Wake up: curtains drawn back, warm light in the kitchen, bedroom, bath.
     The front door lock is intentionally left alone (safety-sensitive). */
  morning: {
    curtains: { open: true },
    bedroomCurtains: { open: true },
    mainDoor: { open: false },
    hallLight: { power: true, brightness: 0.7, color: '#ffe9cf' },
    porchLight: { power: true, brightness: 0.6, color: '#ffe0b0' },
    kitchenLight: { power: true, brightness: 1, color: '#fff2dd' },
    kitchenStrip: { power: true, brightness: 0.9, color: '#ffe9cf' },
    bathroomLight: { power: true, brightness: 0.9, color: '#eaf2ff' },
    mirrorLight: { power: true, brightness: 0.9, color: '#ffffff' },
    bedroomLight: { power: true, brightness: 0.7, color: '#ffe9cf' },
    bedLampLeft: { power: true, brightness: 0.6, color: '#ffe9cf' },
    bedLampRight: { power: true, brightness: 0.6, color: '#ffe9cf' },
    ceilingLightA: { power: true, brightness: 0.7, color: '#ffe9cf' },
    ceilingLightB: { power: true, brightness: 0.7, color: '#ffe9cf' },
    tableLamp: { power: false },
    floorLamp: { power: false },
    tv: { power: false },
    bedroomAC: { power: false },
  },
}
