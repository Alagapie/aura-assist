/**
 * Which AuraAssist server this copy of the simulator talks to.
 *
 * The server normally runs on another machine (the one with the Python
 * environment and AWS credentials), so the address cannot be hardcoded. This
 * module is the single source of truth for it: every service builds its URLs
 * from `baseUrl()`, and the connection panel edits it here.
 *
 * Resolution order:
 *   1. an address chosen in the connection panel (kept in localStorage),
 *   2. VITE_AURA_SERVER from the environment, when set,
 *   3. same-origin, which is the Vite dev proxy during development.
 *
 * Discovery is deliberately honest about what a browser can do. A web page
 * cannot scan a subnet: it may only probe URLs we already name. So `discover()`
 * probes a short, explicit candidate list - a saved/guessed LAN address, the
 * usual localhost ports, and the host this page was served from with the
 * server's default port. Every candidate is verified with a real /health
 * request, so a hit is always a real server.
 */

const STORAGE_KEY = 'aura.serverUrl'
const DEFAULT_PORT = 8000
const PROBE_TIMEOUT = 2500

/** Same-origin (the Vite proxy) unless something overrides it. */
const SAME_ORIGIN = ''

const envBase = (() => {
  const raw = import.meta.env.VITE_AURA_SERVER
  return raw ? raw.replace(/\/+$/, '') : null
})()

let current = readStored() ?? envBase ?? SAME_ORIGIN

function readStored() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || null
  } catch {
    return null // private mode / storage disabled
  }
}

function writeStored(value) {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, value)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* not fatal: the address just won't survive a reload */
  }
}

/** Is this connection using the same-origin proxy rather than a direct host? */
export const isSameOrigin = (base) => !base

/** Normalise what a person types: add a scheme, drop trailing slashes. */
export function normaliseBaseUrl(input) {
  const raw = String(input || '').trim().replace(/\/+$/, '')
  if (!raw) return SAME_ORIGIN
  if (/^https?:\/\//i.test(raw)) return raw
  return `http://${raw}`
}

/** The base URL every service prefixes its paths with ('' = same origin). */
export function baseUrl() {
  return current
}

/** Build an absolute-or-proxied URL for one API path. */
export function apiUrl(path) {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${current}${suffix}`
}

/** Point every service at a new address. Pass '' for the same-origin proxy. */
export function setBaseUrl(value) {
  current = normaliseBaseUrl(value)
  writeStored(current)
  return current
}

/** A short label for the status bar ("this machine" / the host). */
export function describeBaseUrl() {
  if (isSameOrigin(current)) return 'this machine (proxy)'
  try {
    return new URL(current).host
  } catch {
    return current
  }
}

/**
 * Probe one candidate. Resolves with the /health body on success, or null.
 * `AbortController` keeps a dead host from stalling discovery for 30 seconds.
 */
async function probe(baseUrl) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT)
  try {
    const res = await fetch(`${normaliseBaseUrl(baseUrl)}/health`, {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!res.ok) return null
    const body = await res.json()
    // A real AuraAssist server answers with its service name; anything else
    // on port 8000 is not ours.
    if (body?.service !== 'aura-assist') return null
    return body
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Candidate addresses to try, most likely first.
 *
 * The page's own origin comes first because that is the normal setup: open the
 * 3D view over the network (http://192.168.x.x:5173) and the server is on the
 * same machine that serves it.
 */
function candidates() {
  const list = []
  // SAME_ORIGIN is '' - falsy, but a real candidate (the dev proxy, or a
  // reverse proxy in production), so test membership rather than truthiness.
  const add = (value) => {
    const normalised = normaliseBaseUrl(value)
    if (!list.includes(normalised)) list.push(normalised)
  }

  add(current)

  try {
    const { protocol, hostname } = window.location
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      add(`${protocol}//${hostname}:${DEFAULT_PORT}`)
    }
  } catch {
    /* about:blank and friends */
  }

  add(`http://localhost:${DEFAULT_PORT}`)
  add(`http://127.0.0.1:${DEFAULT_PORT}`)
  add(SAME_ORIGIN) // the Vite proxy, when one is running (no-op if already first)

  return list
}

/**
 * Find a reachable server. Returns `{ url, health }` or null.
 *
 * When `preferCurrent` is true (a normal reload) the saved address is probed
 * alone first, so a working setup never pays for the fallback probes.
 */
export async function discover({ preferCurrent = true, onProgress } = {}) {
  const list = candidates()
  const ordered = preferCurrent && current ? [current, ...list.filter((c) => c !== current)] : list

  for (const candidate of ordered) {
    onProgress?.(candidate)
    const health = await probe(candidate)
    if (health) {
      setBaseUrl(candidate)
      return { url: candidate, health }
    }
  }
  return null
}

/** Check one specific address (used by the panel's "Test" button). */
export async function testConnection(value) {
  const candidate = normaliseBaseUrl(value)
  const health = await probe(candidate)
  return { ok: Boolean(health), url: candidate, health }
}
