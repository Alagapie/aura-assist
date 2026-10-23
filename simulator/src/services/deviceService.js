/**
 * Device-control abstraction layer.
 *
 * Every command sent from the UI or from automation goes through the
 * `deviceService` singleton. The default adapter is fully simulated, so the
 * project runs with no hardware and no credentials.
 *
 * To connect real hardware, swap the adapter (environment variable
 * VITE_DEVICE_BACKEND) for one of the network adapters below. The network
 * adapters are intentionally strict: they throw when the backend is not
 * reachable, which lets the store roll an optimistically applied state back
 * to the last confirmed value.
 *
 *   VITE_DEVICE_BACKEND=aura        (default; talks to the AuraAssist server)
 *   VITE_DEVICE_BACKEND=simulated   (no network at all)
 *   VITE_DEVICE_BACKEND=fastapi     VITE_API_BASE=http://localhost:8000
 *   VITE_DEVICE_BACKEND=homeassistant
 *   VITE_DEVICE_BACKEND=mqtt
 */

import { apiUrl as auraApiUrl, baseUrl as auraBaseUrl } from './auraConnection'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Local, in-browser device simulation. No network, no credentials. */
export class SimulatedDeviceAdapter {
  constructor() {
    this.kind = 'simulated'
    this.label = 'Simulated devices'
    this.connected = false
  }

  async connect() {
    await delay(150)
    this.connected = true
    return true
  }

  /** Resolve an acknowledgement after a short, human-imperceptible delay. */
  async send(deviceId, command, payload = {}) {
    if (!this.connected) await this.connect()
    await delay(50 + Math.random() * 90)
    return { ok: true, deviceId, command, payload, at: Date.now() }
  }
}

/** POST /devices/{id}/commands against a Python FastAPI backend. */
export class FastApiDeviceAdapter {
  constructor(baseUrl = 'http://localhost:8000') {
    this.kind = 'fastapi'
    this.label = `FastAPI (${baseUrl})`
    this.baseUrl = baseUrl
    this.connected = false
  }

  async connect() {
    const res = await fetch(`${this.baseUrl}/health`)
    if (!res.ok) throw new Error(`FastAPI backend unavailable (${res.status})`)
    this.connected = true
    return true
  }

  async send(deviceId, command, payload = {}) {
    const res = await fetch(`${this.baseUrl}/devices/${encodeURIComponent(deviceId)}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, payload }),
    })
    if (!res.ok) throw new Error(`Command rejected (${res.status})`)
    return res.json()
  }
}

/**
 * The AuraAssist MCP server (python -m uvicorn server.main:app --port 8000).
 *
 * Every UI action is mirrored to the server's home state, which is the single
 * source of truth for the agent, routines and the MCP tools. The server also
 * streams its own changes back over SSE (see services/auraStream.js), so the
 * 3D house follows whatever the assistant does in real time.
 *
 * When the server is not running the simulator stays fully usable: the adapter
 * degrades to the in-browser simulation instead of failing every click.
 */
export class AuraAdapter {
  constructor(baseUrl = '') {
    this.kind = 'aura'
    this.label = 'AuraAssist server'
    // '' means "use whatever the connection module resolved".
    this.baseUrl = baseUrl
    this.connected = false
    this.fallback = null
  }

  /** '' (same-origin proxy) or the address chosen in the connection panel. */
  get target() {
    return this.baseUrl || auraBaseUrl()
  }

  /** Probe the configured target; fall back to the in-browser simulation. */
  async connect() {
    try {
      const res = await fetch(auraApiUrl('/health'), { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json().catch(() => ({}))
      this.connected = true
      this.fallback = null
      this.label = `AuraAssist · ${body.agent_engine === 'bedrock' ? 'Bedrock' : 'MCP'}`
      return true
    } catch {
      this.fallback = new SimulatedDeviceAdapter()
      await this.fallback.connect()
      this.connected = true
      this.label = 'Simulated devices (AuraAssist server offline)'
      return true
    }
  }

  /** Re-probe after the connection panel points at a different server. */
  async reconnect() {
    this.connected = false
    this.fallback = null
    return this.connect()
  }

  async send(deviceId, command, payload = {}) {
    if (!this.connected) await this.connect()
    // Server offline (or it went away mid-session): keep the house interactive.
    if (this.fallback) return this.fallback.send(deviceId, command, payload)

    const res = await fetch(auraApiUrl('/state/patch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, patch: payload, source: 'simulator' }),
    })
    if (!res.ok) throw new Error(`Bridge rejected the command (${res.status})`)
    const body = await res.json()
    if (body.error) throw new Error(body.error)
    return body
  }
}

/** Home Assistant REST example - point at a long-lived access token. */
export class HomeAssistantAdapter {
  constructor(baseUrl = 'http://homeassistant.local:8123', token = '') {
    this.kind = 'homeassistant'
    this.label = 'Home Assistant'
    this.baseUrl = baseUrl
    this.token = token
    this.connected = false
  }

  async connect() {
    if (!this.token) throw new Error('Home Assistant token not configured')
    const res = await fetch(`${this.baseUrl}/api/`, {
      headers: { Authorization: `Bearer ${this.token}` },
    })
    if (!res.ok) throw new Error('Home Assistant unreachable')
    this.connected = true
    return true
  }

  async send(deviceId, command, payload = {}) {
    if (!this.token) throw new Error('Home Assistant token not configured')
    const res = await fetch(`${this.baseUrl}/api/services/${payload.domain}/turn_${payload.state}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entity_id: payload.entityId }),
    })
    if (!res.ok) throw new Error(`Home Assistant call failed (${res.status})`)
    return res.json()
  }
}

/** MQTT example - requires an MQTT client bundle (mqtt.js) to be installed. */
export class MqttDeviceAdapter {
  constructor(brokerUrl = 'mqtt://localhost:1883') {
    this.kind = 'mqtt'
    this.label = `MQTT (${brokerUrl})`
    this.brokerUrl = brokerUrl
    this.connected = false
  }

  async connect() {
    throw new Error('MQTT adapter requires the "mqtt" client package - see README.md')
  }

  async send() {
    throw new Error('MQTT adapter not configured - see README.md')
  }
}

export function createDeviceService(kind = 'simulated', options = {}) {
  switch (kind) {
    case 'aura':
      return new AuraAdapter(options.baseUrl || '')
    case 'fastapi':
      return new FastApiDeviceAdapter(options.baseUrl || import.meta.env.VITE_API_BASE)
    case 'homeassistant':
      return new HomeAssistantAdapter(options.baseUrl, options.token)
    case 'mqtt':
      return new MqttDeviceAdapter(options.brokerUrl)
    case 'simulated':
    default:
      return new SimulatedDeviceAdapter()
  }
}

// Default is the AuraAssist bridge; it falls back to simulated devices when the
// server is offline, so the 3D house always works.
export const deviceService = createDeviceService(import.meta.env.VITE_DEVICE_BACKEND || 'aura')
