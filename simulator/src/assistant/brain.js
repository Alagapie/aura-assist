/**
 * Alexa - the simulator's built-in voice assistant "brain".
 *
 * Pure text -> plan: `parseCommand(text, state)` never touches React, THREE or
 * the store. It reads a `{ devices, room, currentRoom, activeMode }` snapshot
 * and returns `{ reply, actions, intent }`, where every action is a plain
 * description (`commit` / `scene` / `nav` / `call`) that the VoiceAssistant
 * component replays through the exact same store commands a click uses. That
 * keeps voice control consistent with every other surface *and* keeps the
 * assistant testable in plain Node - the same reason `config/*` and
 * `automation/modes.js` are free of renderer imports.
 *
 * The parser is deliberately rule-based: it understands imperative device
 * commands ("turn off the bedroom lights", "set the AC to 20 degrees", "open
 * the curtains"), scenes ("movie mode", "good night"), navigation ("go to the
 * kitchen") and a handful of questions ("what's on?", "how hot is it?", "is
 * the TV on?"). Scope words ("in the kitchen", "the bedroom") filter which
 * devices a command touches; without one, a command reaches the whole house.
 */

import { ROOM_LIST } from '../config/house.js'
import { MODE_LIST } from '../automation/modes.js'
import { describeDevice } from '../config/devices.js'

export const ASSISTANT_NAME = 'Alexa'

/* --------------------------------------------------------------- helpers -- */

/** Lowercase, strip punctuation (keep digits/%/°) and pad with spaces. */
const normalize = (text) =>
  ` ${String(text || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9°%\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `

/** Does the (padded) text contain `phrase` as whole words? */
const has = (text, phrase) => text.includes(` ${phrase} `)

const hasAny = (text, words) => words.some((w) => has(text, w))

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

/** Words that are a greeting on their own ("hi alexa", "hey", "hello"). */
const GREETING_WORDS = ['hi', 'hello', 'hey', 'hiya', 'howdy', 'yo', 'greetings', 'sup']

/** Keep patches (and the spoken percentages) free of float noise. */
const round2 = (n) => Math.round(n * 100) / 100

/* ----------------------------------------------------------- room scopes -- */

const ROOM_PHRASES = [
  { id: 'living', words: ['living room', 'livingroom', 'sitting room', 'lounge', 'living'] },
  { id: 'bedroom', words: ['master bedroom', 'bedroom', 'bed room'] },
  { id: 'kitchen', words: ['kitchen'] },
  { id: 'bathroom', words: ['bathroom', 'bath room', 'restroom', 'washroom', 'shower room', 'bath'] },
  { id: 'hallway', words: ['entrance hall', 'hallway', 'hall', 'entrance', 'corridor', 'porch', 'front door'] },
]

const ROOM_LABEL = Object.fromEntries(ROOM_LIST.map((r) => [r.id, r.label]))

/**
 * "What is on / in <place>" - the questions only a camera can answer.
 *
 * Group 1 = the preposition (on / in), group 2 = the place. The text handed in
 * is already normalised, so "what's" reads as "whats" and "what's on the
 * coffee table" matches without an apostrophe.
 */
const VISUAL_QUESTION =
  /\b(?:what|whats|what is|what are|show me|tell me|check|inspect)\b[^?!]{0,25}?(?:\b(on|in|inside)\s+(?:the|my|our)?\s*)?([a-z0-9 ]+?)\s*$/

/** Words that mean the sentence is not really about a place. */
const NOT_A_PLACE = /\b(i|you|we|do|does|did|can|could|should|would|happening|going)\b/

/**
 * Hand the sentence to the AuraAssist agent, which owns the VLM and the
 * camera memory. The web client registers the transport with
 * `setInvokeAgent`, so the rule engine never talks to the network itself.
 */
let agentInvoker = null

/** Register the function used for `ask_agent` actions (returns a promise). */
export function setInvokeAgent(fn) {
  agentInvoker = typeof fn === 'function' ? fn : null
}

/** The registered agent transport, if any. */
export function getInvokeAgent() {
  return agentInvoker
}

/** Every room the sentence mentions. Empty set = whole house. */
function findRooms(text) {
  const rooms = new Set()
  for (const { id, words } of ROOM_PHRASES) {
    for (const w of words) {
      if (has(text, w)) { rooms.add(id); break }
    }
  }
  return rooms
}

/* ------------------------------------------------------- device vocabulary */

/**
 * Named devices the user refers to by a distinctive phrase. One phrase can
 * cover several ids ("bedside lamp" -> both), and the longest phrases win.
 */
const DEVICE_RULES = [
  { ids: ['bedLampLeft'], phrases: ['left bedside lamp', 'left bed lamp', 'left nightstand lamp'] },
  { ids: ['bedLampRight'], phrases: ['right bedside lamp', 'right bed lamp', 'right nightstand lamp'] },
  { ids: ['bedLampLeft', 'bedLampRight'], phrases: ['bedside lamps', 'bedside lamp', 'nightstand lamp', 'bedside lights'] },
  { ids: ['mirrorLight'], phrases: ['mirror light', 'vanity light', 'bathroom mirror', 'the mirror'] },
  { ids: ['kitchenStrip'], phrases: ['under cabinet strip', 'under cabinet light', 'under cabinet', 'cabinet strip', 'kitchen strip'] },
  { ids: ['rangeHood'], phrases: ['range hood', 'extractor hood', 'cooker hood', 'exhaust hood'] },
  { ids: ['bathFan'], phrases: ['exhaust fan', 'extractor fan', 'bathroom fan'] },
  { ids: ['porchLight'], phrases: ['porch light', 'entry sconce', 'outside light', 'outdoor light', 'front light'] },
  { ids: ['doorLock'], phrases: ['front door lock', 'door lock', 'deadbolt'] },
  { ids: ['mainDoor'], phrases: ['main door', 'entrance door', 'entry door'] },
  { ids: ['doorbell'], phrases: ['door bell', 'doorbell', 'front bell'] },
  { ids: ['tableLamp'], phrases: ['table lamp'] },
  { ids: ['floorLamp'], phrases: ['floor lamp'] },
  { ids: ['sconceLeft'], phrases: ['left sconce', 'left wall light'] },
  { ids: ['sconceRight'], phrases: ['right sconce', 'right wall light'] },
  { ids: ['ceilingLightA'], phrases: ['left ceiling light'] },
  { ids: ['ceilingLightB'], phrases: ['right ceiling light'] },
  { ids: ['fan'], phrases: ['standing fan'] },
].map((rule) => ({ ...rule, phrases: [...rule.phrases].sort((a, b) => b.length - a.length) }))

/** Whole device *classes* ("the lights", "the AC", "every fan"). */
const KIND_WORDS = [
  { kind: 'light', words: ['lights', 'light', 'lamps', 'lamp', 'lighting', 'sconces', 'sconce'] },
  { kind: 'ac', words: ['air conditioner', 'air conditioning', 'air con', 'aircon', 'ac', 'climate control', 'heat pump'] },
  { kind: 'fan', words: ['fans', 'fan'] },
  { kind: 'tv', words: ['television', 'tv', 'telly'] },
  { kind: 'curtains', words: ['curtains', 'curtain', 'blinds', 'drapes'] },
  { kind: 'door', words: ['doors', 'door'] },
  { kind: 'lock', words: ['locks', 'lock'] },
  { kind: 'fridge', words: ['fridge', 'refrigerator', 'freezer'] },
  { kind: 'cooker', words: ['cooker', 'oven', 'hob', 'stove', 'cooktop'] },
  { kind: 'shower', words: ['shower'] },
  { kind: 'doorbell', words: ['doorbell', 'door bell'] },
  { kind: 'switch', words: ['switches', 'switch'] },
  { kind: 'everything', words: ['everything', 'all devices', 'all the devices', 'every device', 'all appliances', 'every appliance'] },
]

/** What a *device class* an attribute word implies, when no device is named. */
const ATTRIBUTE_WORDS = [
  { kind: 'tv', words: ['volume', 'sound', 'audio'] },
  { kind: 'tv', words: ['channel'] },
  { kind: 'light', words: ['brightness', 'dimmer'] },
  { kind: 'ac', words: ['temperature', 'thermostat', 'temp', 'degrees', 'degree', 'warmer', 'cooler', 'colder'] },
  { kind: 'fan', words: ['speed'] },
]

/**
 * Devices a "turn off everything" style command may power down. The fridge,
 * doors and the lock are deliberately excluded - the same safety rule the
 * automation scenes follow (see automation/modes.js).
 */
const POWERABLE_TYPES = ['light', 'tv', 'ac', 'fan', 'shower', 'cooker']

/**
 * Find every device a sentence refers to, honouring the room scope.
 *
 * Specific phrases are removed from the text ("the table lamp") before the
 * class words are scanned, so the word "lamp" inside a *named* device never
 * re-expands the request to every lamp in the house.
 */
function findTargets(text, devices, rooms) {
  const explicit = []
  let remainder = text
  for (const { ids, phrases } of DEVICE_RULES) {
    const phrase = phrases.find((p) => has(remainder, p))
    if (!phrase) continue
    // Blank the phrase out (same length, so word boundaries stay put).
    remainder = remainder.replace(` ${phrase} `, ` ${' '.repeat(phrase.length)} `)
    for (const id of ids) {
      const device = devices.find((d) => d.id === id)
      if (device && !explicit.includes(device)) explicit.push(device)
    }
  }

  const generic = []
  for (const { kind, words } of KIND_WORDS) {
    if (!hasAny(remainder, words)) continue
    if (kind === 'everything') {
      for (const d of devices) if (POWERABLE_TYPES.includes(d.type)) generic.push(d)
      continue
    }
    for (const d of devices) if (d.type === kind) generic.push(d)
  }

  if (!generic.length) {
    for (const { kind, words } of ATTRIBUTE_WORDS) {
      if (!hasAny(remainder, words)) continue
      for (const d of devices) if (d.type === kind) generic.push(d)
    }
  }

  // A room scope filters the generic classes; explicit names always survive,
  // and an empty filter falls back to the unscoped matches.
  let scoped = generic
  if (rooms.size && generic.length) {
    const inRoom = generic.filter((d) => rooms.has(d.room))
    if (inRoom.length) scoped = inRoom
  }

  const merged = [...explicit]
  for (const d of scoped) if (!merged.includes(d)) merged.push(d)
  return merged
}

/* ------------------------------------------------------------- verb scan -- */

const dirIntent = (m) => (m[1] === 'down' || m[1] === 'lower' ? 'down' : 'up')

/**
 * Imperative markers, in the priority order the overlap filter below needs:
 * two-word forms ("turn off", "shut down") must be listed before their bare
 * words ("off", "down") so they swallow them.
 */
const MARKER_PATTERNS = [
  { re: /\bturn (?:it )?(on|off)\b/, map: (m) => m[1] },
  { re: /\bswitch (?:it )?(on|off)\b/, map: (m) => m[1] },
  { re: /\bpower (?:it )?(on|off|down)\b/, map: (m) => (m[1] === 'down' ? 'off' : m[1]) },
  { re: /\bput (?:it )?(on|off)\b/, map: (m) => m[1] },
  { re: /\bshut (?:it )?(down|off)\b/, map: () => 'off' },
  { re: /\bspin (?:it )?(up|down)\b/, map: (m) => (m[1] === 'up' ? 'on' : 'off') },
  { re: /\bturn (?:it )?(up|down)\b/, map: dirIntent },
  { re: /\b(?:next|forward) channel\b/, map: () => 'up' },
  { re: /\b(?:previous|prev|back) channel\b/, map: () => 'down' },
  { re: /\bchannel (?:up|forward|next)\b/, map: () => 'up' },
  { re: /\bchannel (?:down|back|previous|prev)\b/, map: () => 'down' },
  { re: /\b(unlock|lock|open|close|ring)\b/, map: (m) => m[1] },
  { re: /\b(mute|unmute)\b/, map: (m) => m[1] },
  { re: /\b(dim|darken|darker)\b/, map: () => 'down' },
  { re: /\b(brighten|brighter|light up)\b/, map: () => 'up' },
  { re: /\bwarmer\b/, map: () => 'up' },
  { re: /\bcooler\b/, map: () => 'down' },
  { re: /\b(raise|lower|increase|decrease|reduce|boost|crank|bump|drop)\b/, map: dirIntent },
  { re: /\b(set|adjust|change|make)\b/, map: () => 'set' },
  { re: /\b(start|stop|enable|disable)\b/, map: (m) => (m[1] === 'start' || m[1] === 'enable' ? 'on' : 'off') },
  { re: /\b(up|down)\b/, map: (m) => m[1] },
  { re: /\b(on|off)\b/, map: (m) => m[1] },
]

/** Every imperative marker in the sentence, left to right, overlaps removed. */
function scanMarkers(text) {
  const found = []
  for (const { re, map } of MARKER_PATTERNS) {
    const rx = new RegExp(re.source, 'g')
    let m
    while ((m = rx.exec(text))) {
      found.push({ index: m.index, end: m.index + m[0].length, len: m[0].length, intent: map(m) })
    }
  }
  found.sort((a, b) => a.index - b.index || b.len - a.len)
  const markers = []
  for (const f of found) {
    if (markers.length && f.index < markers[markers.length - 1].end) continue
    markers.push(f)
  }
  // "the TV is off" is a statement, not a command: bare on/off after a form of
  // "to be" answers rather than toggles.
  if (/\s(is|are|was|were)\s/.test(text)) {
    return markers.filter((mk) => mk.intent !== 'on' && mk.intent !== 'off')
  }
  return markers
}

/* ----------------------------------------------------------- value reads -- */

/** The number (or word amount) a "set" span carries, if any. */
function extractValue(scope) {
  const m = scope.match(/\b(\d{1,3})\s*(%|percent|degrees?|°)?/)
  if (m) return { value: Number(m[1]), unit: m[2] || '', text: m[0].trim() }
  if (has(scope, 'half')) return { value: 0.5, unit: 'fraction', text: 'half' }
  if (has(scope, 'quarter')) return { value: 0.25, unit: 'fraction', text: 'quarter' }
  if (hasAny(scope, ['full', 'max', 'maximum', 'highest', 'brightest', 'loudest'])) return { value: 'max', unit: '', text: 'full' }
  if (hasAny(scope, ['lowest', 'minimum', 'min'])) return { value: 'min', unit: '', text: 'minimum' }
  return null
}

/** Human phrase for a computed value, per device type. */
const sayValue = (type, patch) => {
  if (patch.targetTemp !== undefined) return `${patch.targetTemp}°C`
  if (patch.temp !== undefined) return `${patch.temp}°C`
  if (patch.brightness !== undefined) return `${Math.round(patch.brightness * 100)}% bright`
  if (patch.channel !== undefined) return `channel ${patch.channel}`
  if (patch.volume !== undefined) return `volume ${patch.volume}%`
  if (patch.speed !== undefined) return `speed ${patch.speed}`
  if (patch.heat !== undefined && patch.heat > 0) return `level ${patch.heat}`
  return 'updated'
}

const AC_MODE_WORDS = [
  { mode: 'cool', words: ['cool', 'cooling', 'chill', 'cold'] },
  { mode: 'heat', words: ['heat', 'heating', 'warm', 'warmer'] },
  { mode: 'dry', words: ['dry', 'drying', 'dehumidify'] },
  { mode: 'auto', words: ['auto', 'automatic'] },
  { mode: 'fan', words: ['fan mode', 'fan only', 'fan speed'] },
]
const AC_MODE_LABEL = { cool: 'cooling', heat: 'heating', dry: 'drying', auto: 'auto', fan: 'fan only' }

/* ------------------------------------------------- per-device action maps -- */

/** Turn something meaningfully on/off. Returns null when not applicable. */
function powerAction(device, on, scope) {
  switch (device.type) {
    case 'light':
      return { patch: { power: on }, command: 'light.set', say: on ? 'is on' : 'is off' }
    case 'tv': case 'ac': case 'fan':
      return { patch: { power: on }, command: 'power.set', say: on ? 'is on' : 'is off' }
    case 'shower':
      return { patch: { power: on }, command: 'shower.set', say: on ? 'is running' : 'is off' }
    case 'cooker':
      return on
        ? {
            patch: /oven/.test(scope) ? { power: true, ovenOn: true } : { power: true, heat: 1, ovenOn: false },
            command: 'cooker.set',
            say: 'is on',
          }
        : { patch: { power: false, heat: 0, ovenOn: false }, command: 'cooker.set', say: 'is off' }
    case 'fridge':
      return { patch: { power: on }, command: 'fridge.set', say: on ? 'is on' : 'is off' }
    case 'curtains':
      return { patch: { open: on }, command: 'cover.set', say: on ? 'are open' : 'are closed' }
    case 'door':
      return { patch: { open: on }, command: 'door.set', say: on ? 'is open' : 'is closed' }
    case 'lock':
      return { patch: { locked: on }, command: 'lock.set', say: on ? 'is locked' : 'is unlocked' }
    case 'doorbell':
      return on ? { call: 'ringDoorbell', args: ['doorbell'], say: 'is ringing' } : null
    case 'switch':
      return { call: 'toggleSwitch', args: [device.id], say: 'toggled' }
    default:
      return null
  }
}

/** Open/close covers, doors and the fridge. */
function openAction(device, open, scope) {
  switch (device.type) {
    case 'curtains':
      return { patch: { open }, command: 'cover.set', say: open ? 'are open' : 'are closed' }
    case 'door':
      return { patch: { open }, command: 'door.set', say: open ? 'is open' : 'is closed' }
    case 'fridge': {
      const both = has(scope, 'fridge') && has(scope, 'freezer')
      if (has(scope, 'freezer') && !both) {
        return { patch: { freezerOpen: open }, command: 'fridge.set', say: open ? 'freezer is open' : 'freezer is closed' }
      }
      return { patch: open ? { open: true, freezerOpen: both } : { open: false, freezerOpen: false }, command: 'fridge.set', say: open ? 'is open' : 'is closed' }
    }
    case 'window':
      return { patch: { open }, command: 'cover.set', say: open ? 'is open' : 'is closed' }
    default:
      return null
  }
}

/** Dim / brighten / volume up / temperature down, and friends. */
function nudgeAction(device, dir, scope) {
  const step = dir > 0 ? 1 : -1
  switch (device.type) {
    case 'light': {
      const brightness = round2(clamp((device.brightness ?? 0.7) + step * 0.2, 0.05, 1))
      return { patch: { brightness, power: true }, command: 'light.set', say: `${Math.round(brightness * 100)}% bright` }
    }
    case 'tv': {
      // "channel up / next channel / channel down / previous channel" nudges the channel;
      // everything else nudges volume (the default behaviour).
      const channelScope = has(scope, 'channel') || hasAny(scope, ['next channel', 'previous channel', 'channel up', 'channel down'])
      if (channelScope) {
        const channel = clamp((device.channel ?? 1) + step, 1, 99)
        return { patch: { channel, power: true }, command: 'tv.set', say: `channel ${channel}` }
      }
      const volume = clamp((device.volume ?? 20) + step * 10, 0, 100)
      return { patch: { volume, muted: false, power: true }, command: 'tv.set', say: `volume ${volume}%` }
    }
    case 'fan': {
      const speed = clamp((device.speed ?? 1) + step, 1, 3)
      return { patch: { speed, power: true }, command: 'fan.set', say: `speed ${speed}` }
    }
    case 'ac': {
      const targetTemp = clamp((device.targetTemp ?? 22) + step, 16, 30)
      return { patch: { targetTemp, power: true }, command: 'ac.set', say: `${targetTemp}°C` }
    }
    case 'cooker': {
      const heat = clamp((device.heat ?? 0) + step, 0, 5)
      return { patch: { heat, power: heat > 0 }, command: 'cooker.set', say: `level ${heat}` }
    }
    case 'shower': {
      const temp = clamp((device.temp ?? 38) + step, 24, 45)
      return { patch: { temp }, command: 'shower.set', say: `${temp}°C` }
    }
    default:
      return null
  }
}

/** Explicit "set X to Y" values. */
function setAction(device, scope, read) {
  const max = read && read.value === 'max'
  const min = read && read.value === 'min'
  const raw = read && typeof read.value === 'number' ? read.value : null
  const percent = raw !== null && (read.unit === '%' || read.unit === 'percent' || raw > 1)
  switch (device.type) {
    case 'light': {
      const brightness = max ? 1 : min ? 0.1 : raw === null ? null : round2(clamp(raw > 1 ? raw / 100 : raw, 0.05, 1))
      if (brightness === null) return null
      return { patch: { brightness, power: true }, command: 'light.set', say: `${Math.round(brightness * 100)}% bright` }
    }
    case 'tv': {
      if (has(scope, 'channel') && raw !== null) {
        return { patch: { channel: clamp(raw, 1, 99), power: true }, command: 'tv.set', say: `channel ${clamp(raw, 1, 99)}` }
      }
      const volume = max ? 100 : min ? 5 : raw === null ? null : clamp(raw > 1 || percent || read.unit === '' ? raw : raw * 100, 0, 100)
      if (volume === null) return null
      return { patch: { volume, muted: false, power: true }, command: 'tv.set', say: `volume ${volume}%` }
    }
    case 'ac': {
      const modeWord = AC_MODE_WORDS.find(({ words }) => hasAny(scope, words))
      if (modeWord && raw === null) {
        return { patch: { mode: modeWord.mode, power: true }, command: 'ac.set', say: AC_MODE_LABEL[modeWord.mode] }
      }
      const targetTemp = max ? 30 : min ? 16 : raw === null ? null : clamp(raw, 16, 30)
      if (targetTemp === null) return null
      return { patch: { targetTemp, power: true }, command: 'ac.set', say: `${targetTemp}°C` }
    }
    case 'fan': {
      const speed = max ? 3 : min ? 1 : raw === null ? null : clamp(Math.round(raw), 1, 3)
      if (speed === null) return null
      return { patch: { speed, power: true }, command: 'fan.set', say: `speed ${speed}` }
    }
    case 'cooker': {
      const level = max ? 5 : min ? 0 : raw === null ? null : clamp(Math.round(raw), 0, 5)
      if (level === null) return null
      return { patch: { heat: level, power: level > 0, ovenOn: level > 0 ? device.ovenOn : false }, command: 'cooker.set', say: `level ${level}` }
    }
    case 'shower': {
      const temp = max ? 45 : min ? 24 : raw === null ? null : clamp(raw, 24, 45)
      if (temp === null) return null
      return { patch: { temp }, command: 'shower.set', say: `${temp}°C` }
    }
    case 'fridge': {
      const targetTemp = raw === null ? null : clamp(raw, 1, 8)
      if (targetTemp === null) return null
      return { patch: { targetTemp }, command: 'fridge.set', say: `${targetTemp}°C` }
    }
    default:
      return null
  }
}

/* ---------------------------------------------------------- scene triggers */

const SCENE_TRIGGERS = [
  { modeId: 'movie', words: ['movie mode', 'movie time', 'movie night', 'cinema mode', 'watch a movie', 'start a movie', 'a movie', 'movie'] },
  { modeId: 'bedtime', words: ['bedtime', 'good night', 'goodnight', 'going to bed', 'time for bed', 'sleep mode', 'night mode', 'off to bed'] },
  { modeId: 'away', words: ['away mode', 'im leaving', 'i am leaving', 'leaving the house', 'leaving home', 'leaving for work', 'off to work', 'leaving now', 'leaving', 'goodbye', 'bye bye', 'see you later'] },
  { modeId: 'morning', words: ['good morning', 'morning mode', 'wake up', 'rise and shine', 'wakey wakey', 'time to wake up'] },
  { modeId: 'home', words: ['home mode', 'im home', 'i am home', 'back home', 'im back', 'welcome home'] },
]

/* --------------------------------------------------------------- reports -- */

function statusReport(state) {
  const devices = Object.values(state.devices || {})
  const controllable = devices.filter((d) => !['hub', 'sensor', 'switch', 'prop'].includes(d.type))
  const on = controllable.filter((d) => isReallyOn(d))
  const scene = state.activeMode && state.activeMode !== 'Manual' ? ` ${state.activeMode} mode is active.` : ''
  const temp = state.room ? ` It's ${round2(state.room.temp)}°C, ${Math.round(state.room.humidity)}% humidity.` : ''
  if (!on.length) return `Nothing is running.${scene}${temp}`
  const names = on.slice(0, 4).map((d) => d.name)
  const more = on.length > names.length ? ` +${on.length - names.length} more` : ''
  return `${on.length} of ${controllable.length} on: ${names.join(', ')}${more}.${temp}`
}

/** A trimmed-down "is it doing something" test for the report line. */
function isReallyOn(device) {
  switch (device.type) {
    case 'light': case 'tv': case 'ac': case 'fan': case 'shower':
      return !!device.power
    case 'cooker': return !!(device.ovenOn || device.heat > 0)
    case 'fridge': return !!(device.open || device.freezerOpen)
    case 'lock': return device.locked === false
    default: return false
  }
}

function answerStates(targets, devices) {
  if (!targets.length) return null
  return targets
    .slice(0, 6)
    .map((d) => `${d.name}: ${describeDevice(d, devices) || 'unknown'}.`)
    .join(' ')
}

function climateReply(state) {
  const devices = Object.values(state.devices || {})
  const running = devices.find((d) => d.type === 'ac' && d.power)
  const base = `${round2(state.room.temp)}°C, ${Math.round(state.room.humidity)}% humidity`
  return running ? `${base}. ${running.name} set to ${running.targetTemp}°C.` : `${base}. No AC running.`
}

/* --------------------------------------------------------------- the plan */

const plan = (reply, intent, actions = []) => ({ reply, intent, actions })

// Add a specific case for 'Change the channel' commands
const CHANNEL_CHANGE_PATTERN = /\bchange the channel\b/i

const POLITE = /^(?:(?:hey|ok|okay|yo|hi|hello|please|computer|nova|alexa|sir|dear)\s+)*(?:alexa|nova|assistant)\b[,.]?\s*/i
const NAV_PHRASE = /\b(?:go to|take me to|show me|head to|move to|switch to|look at|view|navigate to)\b\s*(.*)$/

export function parseCommand(rawText, state = {}) {
  const text = normalize(String(rawText || '').replace(POLITE, ''))
  const devices = Object.values(state.devices || {})
  const byId = state.devices || {}
  const rooms = findRooms(text)

  /* ---- meta intents that need no device parsing ------------------------ */
  // 'hi alexa', 'hey', 'hello' - a sentence made only of greetings (or nothing
  // left after the wake-word prefix was stripped) is a greeting, not a mistake.
  const greetingLeft = text.replace(/\b(hi|hello|hey|hiya|howdy|yo|greetings|sup)\b/g, ' ').replace(/\s+/g, ' ')
  if (!text.trim() || (!greetingLeft.trim() && hasAny(text, GREETING_WORDS))) {
    return plan('Hi. What can I help you with?', 'greeting')
  }
  if (hasAny(text, ['what can you do', 'what do you do', 'help', 'commands', 'abilities', 'how do you work'])) {
    return plan(
      'I control this home - lights, TV, AC, curtains, the door and more. '
      + 'Try: "turn off the kitchen lights", "set the AC to 20 degrees", "movie mode", "good night", or ask "what\'s on?".',
      'help'
    )
  }
  if (hasAny(text, ['who are you', 'your name', 'who am i talking', 'are you alexa', 'are you siri', 'are you google'])) {
    const rival = hasAny(text, ['siri', 'google'])
    return plan(
      rival
       ? "No - I'm Alexa, this home's assistant."
        : `I'm ${ASSISTANT_NAME}. Say "what can you do" for ideas.`,
      'identity'
    )
  }
  if (hasAny(text, ['thank you', 'thanks', 'much appreciated'])) {
    return plan('You\'re welcome.', 'thanks')
  }
  if (hasAny(text, ['what time', 'the time', 'whats the time', 'time is it'])) {
    return plan(`It's ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`, 'time')
  }
  if (hasAny(text, ['status', 'report', 'summary', 'whats on', 'what is on', 'whats running', 'what is running', 'whats going on', 'how many devices'])) {
    return plan(statusReport(state), 'status')
  }

  /* ---- 'Change the channel' command ---------------------------------------- */
  if (CHANNEL_CHANGE_PATTERN.test(text)) {
    const device = devices.find(d => d.type === 'tv')
    if (device) {
      const action = nudgeAction(device, 1, 'channel')
      return plan('', 'command', [action])
    }
    return plan('I can\'t find the TV to change the channel.', 'error')
  }

  /* ---- 'what happening' / 'what all' questions --------------------------- */
  if (/\bwhat (?:happening|all|is going on|is happening|is on|running)\b/i.test(text)) {
    return plan(statusReport(state), 'happening')
  }

  /* ---- climate ('how hot is it') ---------------------------------------- */
  const climateWords = ['how hot', 'how cold', 'temperature', 'room temp', 'humidity', 'weather', 'feel like']
  if (hasAny(text, climateWords) && /^\s*(what|whats|how|is|are)\b/.test(text)) {
    return plan(climateReply(state), 'climate')
  }

  /* ---- visual questions: what is on / in <place> ------------------------- */
  // The agent owns the VLM and the camera memory, so anything that asks what
  // is *visible* is handed over instead of being guessed at from the device
  // list. `text` is normalised, so 'what\'s' has already become 'whats'.
  const visual = VISUAL_QUESTION.exec(text)
  if (visual &&!NOT_A_PLACE.test(visual[2])) {
    const where = visual[1] || 'on'
    let place = visual[2].trim().replace(/^(?:the|my|our)\s+/, '').trim()
    // 'counter in the kitchen' -> place 'counter', room 'kitchen'
    const roomTail = /\b(?:in|on|at|from)\s+(?:the\s+)?([a-z]+)\s*$/.exec(place)
    let roomId = null
    if (roomTail) {
      const found = findRooms(roomTail[1])
      if (found.size === 1) {
        roomId = [...found][0]
        place = place.slice(0, roomTail.index).trim()
      }
    }
    // The place itself may be a room ('what\'s in the bedroom').
    if (!roomId && findRooms(place).size === 1) roomId = [...findRooms(place)][0]
    const roomLabel = roomId? ROOM_LABEL[roomId] : (state.currentRoom === 'living'? 'living room' : state.currentRoom)
    const ask = roomId
     ? `What's ${where === 'in'? 'in' : 'on'} the ${place} in the ${roomLabel}?`
      : `What's ${where === 'in'? 'in' : 'on'} the ${place}?`
    return plan('', 'visual_query', [{ kind: 'ask_agent', question: rawText }])
  }

  /* ---- object location ('where is my phone?') ---------------------------- */
  // 'where is X' is a camera-memory question, not a device question, so it
  // goes to the agent - which searches the sighting memory and falls back to
  // looking through the cameras.
  const whereIs = /\b(?:where (?:is|are)|find|locate|lost)\b\s*(?:my|the|our)?\s*([a-z0-9 ]{2,30}?)\s*$/.exec(text)
  if (whereIs &&!NOT_A_PLACE.test(whereIs[1]) &&!/\bwhats\b|\bwhat\b/.test(whereIs[1])) {
    const item = whereIs[1].trim()
    // 'where is the kitchen light' is a device question - keep it local.
    if (!findTargets(item, devices, rooms).length) {
      return plan('', 'object_location', [{ kind: 'ask_agent', question: rawText }])
    }
  }

  /* ---- things to control ------------------------------------------------ */
  const wholeTargets = findTargets(text, devices, rooms)

  /* ---- yes/no state questions ("is the TV on?") -------------------------- */
  const question = /^\s*(is|are|was|were|do|does|did|any)\b/.test(text)
  if (question && wholeTargets.length && !scanMarkers(text).length) {
    const answer = answerStates(wholeTargets, byId)
    if (answer) return plan(answer, 'question')
  }

  /* ---- navigation ("go to the kitchen") ---------------------------------- */
  const nav = text.match(NAV_PHRASE)
  if (nav) {
    const rest = nav[1] || ''
    const navRooms = findRooms(rest)
    const roomId = navRooms.values().next().value
    if (roomId) {
      return plan(`Here's the ${ROOM_LABEL[roomId]}.`, 'navigation', [{ kind: 'nav', roomId }])
    }
  }
  // A bare room name is a navigation request too ("bedroom", "the kitchen").
  const bareRoom = findRooms(text.replace(/\s(the|a|to|please)\s/g, ' '))
  if (bareRoom.size === 1 && wholeTargets.length === 0 && !scanMarkers(text).length) {
    const roomId = bareRoom.values().next().value
    return plan(`Here's the ${ROOM_LABEL[roomId]}.`, 'navigation', [{ kind: 'nav', roomId }])
  }

  /* ---- scenes ("movie mode", "good night") ------------------------------- */
  if (!wholeTargets.length) {
    for (const { modeId, words } of SCENE_TRIGGERS) {
      if (!hasAny(text, words)) continue
      const mode = MODE_LIST.find((m) => m.id === modeId)
      if (!mode) continue
      // More Alexa-like response
      const action = modeId === 'away' ? 'starting' : modeId === 'movie' ? 'activating' : 'executing'
      return plan(`${mode.label} ${action}.`, 'scene', [{ kind: 'scene', modeId }])
    }
  }

  /* ---- imperative device commands ---------------------------------------- */
  const markers = scanMarkers(text)
  const actions = []
  const said = []

  // A number with no verb at all still reads as a set command
  // ("volume 30", "channel 5", "brightness half").
  const implicitSet = !markers.length && /\d/.test(text) && wholeTargets.length
  const queue = implicitSet ? [{ index: -1, end: 0, intent: 'set' }] : markers

  // Spans: the text each marker acts on. When no span names a device (e.g.
  // "kitchen lights, turn on"), every marker falls back to the whole sentence.
  const spans = queue.map((mk, i) => {
    const from = mk.end
    const to = i + 1 < queue.length ? queue[i + 1].index : text.length
    return text.slice(from, to)
  })
  const spanTargets = spans.map((span) => findTargets(span, devices, rooms))
  const anySpanHasTargets = spanTargets.some((t) => t.length)

  // "turn on the bedroom" / "brighten the bedroom": a bare room with an
  // on/off or dim/bright verb means that room's lights.
  const roomDefault = (intent) => {
    if (!rooms.size) return []
    const pool = devices.filter((d) => rooms.has(d.room))
    if (intent === 'on' || intent === 'off' || intent === 'up' || intent === 'down') {
      return pool.filter((d) => d.type === 'light')
    }
    return []
  }
  const targetsFor = (i, intent) => {
    if (anySpanHasTargets) return spanTargets[i]
    return wholeTargets.length ? wholeTargets : roomDefault(intent)
  }

  queue.forEach((mk, i) => {
    const scope = anySpanHasTargets ? spans[i] : text
    const targets = targetsFor(i, mk.intent)
    if (!targets.length) return

    for (const device of targets) {
      let action = null
      switch (mk.intent) {
        case 'on': case 'off': {
          const on = mk.intent === 'on'
          // "lock the front door": the verb picks the lock, not the leaf.
          if (device.type === 'door' && /\b(lock|unlock)\b/.test(text)) break
          action = powerAction(device, on, scope)
          break
        }
        case 'open': action = openAction(device, true, scope); break
        case 'close': action = openAction(device, false, scope); break
        case 'lock': case 'unlock': {
          if (device.type === 'lock') {
            const locked = mk.intent === 'lock'
            action = { patch: { locked }, command: 'lock.set', say: locked ? 'is locked' : 'is unlocked' }
          } else if (device.type === 'door' && device.room === 'hallway' && byId.doorLock) {
            const locked = mk.intent === 'lock'
            action = { kind: 'commit', id: 'doorLock', patch: { locked }, command: 'lock.set', say: locked ? 'is locked' : 'is unlocked' }
          }
          break
        }
        case 'ring':
          if (device.type === 'doorbell') action = { call: 'ringDoorbell', args: ['doorbell'], say: 'is ringing' }
          break
        case 'mute': case 'unmute':
          if (device.type === 'tv') {
            const muted = mk.intent === 'mute'
            action = { patch: { muted, power: true }, command: 'tv.set', say: muted ? 'is muted' : 'is unmuted' }
          }
          break
        case 'up': case 'down':
          action = nudgeAction(device, mk.intent === 'up' ? 1 : -1, scope)
          break
        case 'set': {
          const read = extractValue(scope)
          if (device.type === 'fan' && hasAny(scope, ['oscillat'])) {
            const oscillate = !hasAny(scope, ['off', 'stop', 'no', 'disable'])
            action = { patch: { oscillate, power: true }, command: 'fan.set', say: oscillate ? 'is oscillating' : 'is fixed' }
            break
          }
          action = setAction(device, scope, read)
          break
        }
        default:
          action = null
      }
      if (!action) continue
      if (action.kind === 'commit') {
        actions.push(action)
      } else if (action.call) {
        actions.push({ kind: 'call', name: action.call, args: action.args || [] })
      } else {
        actions.push({ kind: 'commit', id: device.id, patch: action.patch, command: action.command })
      }
      // "lock the front door" acts on the lock, so credit the lock by name.
      const spoken = (action.id && byId[action.id]?.name) || device.name
      said.push(`${spoken} ${action.say}`)
    }
  })

  if (!actions.length) {
    const asked = wholeTargets.length
      ? wholeTargets.slice(0, 3).map((d) => d.name).join(', ')
      : null
    const fallback = asked
      ? `I don't know how to do that with ${asked}. Try "turn on", "turn off", "open", "close" or "set ... to".`
      : `Sorry, I didn't get that. Try "turn off the bedroom lights", "movie mode", or ask "what's on?".`
    return plan(fallback, 'unknown')
  }

  return plan(summarise(said, actions.length), 'command', actions)
}

/**
 * Keep spoken replies short and natural like Alexa.
 * One device gets named, a couple get listed, and anything bigger collapses into a count.
 * The chat log has the full detail.
 */
function summarise(said, count) {
  if (!said.length) return 'Okay, got it.'
  if (said.length === 1) return `Okay, ${said[0]}.`
  if (said.length <= 3) return `Okay, ${said.join(', ')}.`
  const off = said.filter((s) => /\bis off\b|\bare closed\b/.test(s)).length
  if (off === said.length) return `Okay, all ${count} are off now.`
  return `Okay, I've made ${count} changes for you.`
}
