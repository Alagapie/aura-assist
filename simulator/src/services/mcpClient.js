/**
 * A real MCP client in the browser (Streamable HTTP transport).
 *
 * Speaks JSON-RPC directly to the AuraAssist server's MCP endpoint (/mcp):
 *
 *   initialize  ->  notifications/initialized  ->  tools/list  ->  tools/call
 *
 * That is the same endpoint the Python agent uses; here the web simulator
 * itself is the MCP client, which is what the "MCP" tab in the chat panel
 * shows (handshake, the tool list, and raw in/out frames per call).
 *
 * Responses can arrive as plain JSON or as `text/event-stream` (server's
 * choice per the spec), so both shapes are handled. The address comes from the
 * connection module, so the server may live on another machine.
 */

import { apiUrl } from './auraConnection'

const AURA_MCP_URL = '/mcp'

/** The MCP endpoint on whichever server the connection panel selected. */
export const mcpUrl = () => apiUrl(AURA_MCP_URL)

/** Parse an MCP response body, which may be JSON or a single SSE frame. */
async function readBody(res) {
  if (res.status === 202) return null // notification accepted
  const type = res.headers.get('content-type') || ''
  if (!type.includes('text/event-stream')) {
    const body = await res.json().catch(() => null)
    if (!body) throw new Error(`MCP server returned ${res.status}`)
    return body
  }
  // SSE: read frames until the JSON-RPC message (has an id) shows up.
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let cut = buffer.indexOf('\n\n')
    while (cut >= 0) {
      const frame = buffer.slice(0, cut)
      buffer = buffer.slice(cut + 2)
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('')
      if (data) {
        const message = JSON.parse(data)
        if (message.id !== undefined) return message
      }
      cut = buffer.indexOf('\n\n')
    }
  }
  return null
}

/**
 * Create a client bound to one MCP session.
 *
 * `connect()` performs the handshake; `listTools()` and `callTool()` are the
 * two requests a demo actually needs. `frames` is a rolling log of raw
 * JSON-RPC in/out traffic (already JSON-safe) for the UI to render.
 */
export function createMcpClient({ url, clientName = 'home-simulation-3d' } = {}) {
  let sessionId = null
  let protocolVersion = '2025-11-25'
  let nextId = 1
  const frames = []
  // Resolved at request time so the panel's address applies immediately.
  const endpoint = () => url || mcpUrl()

  const record = (direction, payload) => {
    frames.push({ direction, payload, at: Date.now() })
    if (frames.length > 60) frames.shift()
  }

  const post = async (body, isNotification = false) => {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }
    if (sessionId) {
      headers['mcp-session-id'] = sessionId
      headers['MCP-Protocol-Version'] = protocolVersion
    }
    record('out', body)
    const res = await fetch(endpoint(), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    if (!isNotification && !res.ok && res.status !== 202) {
      throw new Error(`MCP request failed (HTTP ${res.status})`)
    }
    const message = await readBody(res)
    if (message) record('in', message)
    // The server assigns the session id on initialize; keep it for later calls.
    const sid = res.headers.get('mcp-session-id')
    if (sid) sessionId = sid
    return message
  }

  return {
    get frames() {
      return frames
    },
    get sessionId() {
      return sessionId
    },

    /** initialize + notifications/initialized. Idempotent. */
    async connect() {
      const response = await post({
        jsonrpc: '2.0',
        id: nextId++,
        method: 'initialize',
        params: {
          protocolVersion,
          capabilities: {},
          clientInfo: { name: clientName, version: '1.0.0' },
        },
      })
      if (!response?.result) {
        throw new Error(response?.error?.message || 'MCP initialize failed')
      }
      protocolVersion = response.result.protocolVersion || protocolVersion
      await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, true)
      return response.result
    },

    /** The server's tool list (name, description, input schema). */
    async listTools() {
      const response = await post({ jsonrpc: '2.0', id: nextId++, method: 'tools/list', params: {} })
      if (!response?.result) throw new Error(response?.error?.message || 'tools/list failed')
      return response.result.tools || []
    },

    /** Invoke one tool; returns the MCP result ({content, isError}). */
    async callTool(name, args = {}) {
      const response = await post({
        jsonrpc: '2.0',
        id: nextId++,
        method: 'tools/call',
        params: { name, arguments: args },
      })
      if (!response) throw new Error('no response from tools/call')
      if (response.error) throw new Error(response.error.message)
      return response.result
    },

    /** Best-effort session teardown. */
    async close() {
      if (!sessionId) return
      const sid = sessionId
      sessionId = null
      try {
        await fetch(endpoint(), { method: 'DELETE', headers: { 'mcp-session-id': sid } })
      } catch {
        /* the server is gone; nothing to clean up */
      }
    },
  }
}
