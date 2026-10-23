/**
 * Thin HTTP helpers for the AuraAssist agent API (the orchestrator that uses
 * the MCP server under the hood). The chat panel is a plain browser client of
 * these endpoints; the address comes from the connection module, so the server
 * may live on another machine.
 */

import { apiUrl } from './auraConnection'

/** Ask the agent one conversational turn. Returns the standard turn object:
 *  {reply, tool_calls, needs_user_input, pending, engine, timestamp}. */
export async function invokeAgent(message, sessionId = 'web-sim') {
  const res = await fetch(apiUrl('/agent/invoke'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId }),
  })
  if (!res.ok) throw new Error(`agent unreachable (HTTP ${res.status})`)
  const body = await res.json()
  if (body.error) throw new Error(body.error)
  return body
}

/** Forget the conversation (between demo takes). */
export async function resetAgent(sessionId = 'web-sim') {
  const res = await fetch(apiUrl('/agent/reset'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  })
  return res.ok ? res.json() : null
}

/** Restore the default scene (the SSE stream pushes the new state too). */
export async function resetState() {
  const res = await fetch(apiUrl('/state/reset'), { method: 'POST' })
  return res.ok ? res.json() : null
}

/** Liveness + engine mode. */
export async function fetchHealth() {
  const res = await fetch(apiUrl('/health'), { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
