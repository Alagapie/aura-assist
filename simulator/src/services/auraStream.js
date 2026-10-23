/**
 * Live link to the AuraAssist server's home state.
 *
 * The server broadcasts a full snapshot over SSE (`GET /events/state`) after
 * every change - whether it came from the agent, an MCP tool call, a routine or
 * this simulator. The store applies each snapshot to the same device map the 3D
 * scene renders from, so the house follows the assistant in real time.
 *
 * EventSource reconnects on its own; `onStatus` exists purely so the UI can be
 * honest about being offline instead of silently frozen.
 */

import { apiUrl } from './auraConnection'

export function connectAuraStream({
  onSnapshot,
  onStatus,
  url,
} = {}) {
  let closed = false
  let source = null
  let lastStatus = null
  // Resolved at connect time so the panel's address applies to new streams.
  const target = () => url || apiUrl('/events/state')

  const report = (state, detail) => {
    if (state === lastStatus) return
    lastStatus = state
    onStatus?.({ state, detail })
  }

  const open = () => {
    if (closed) return
    report('connecting')
    source = new EventSource(target())

    source.onopen = () => report('online')

    source.onmessage = (event) => {
      if (!event.data || event.data.startsWith(':')) return
      try {
        const snapshot = JSON.parse(event.data)
        if (Array.isArray(snapshot?.devices)) onSnapshot?.(snapshot)
      } catch {
        // Malformed frame: keep the stream alive rather than tearing it down.
      }
    }

    source.onerror = () => {
      // EventSource retries automatically (default ~3 s). Just surface it.
      report('reconnecting')
    }
  }

  open()

  return () => {
    closed = true
    source?.close()
    source = null
  }
}
