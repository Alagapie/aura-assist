import { useEffect, useState } from 'react'
import { Check, Loader2, Plug, Radar, Server, X } from 'lucide-react'
import {
  describeBaseUrl,
  discover,
  isSameOrigin,
  setBaseUrl,
  testConnection,
} from '../services/auraConnection'
import { deviceService } from '../services/deviceService'
import { useRoomStore } from '../store/useRoomStore'

/**
 * Connection panel - the one place that decides which AuraAssist server this
 * copy of the simulator talks to.
 *
 * The Python server usually lives on another machine, so the address cannot be
 * baked in. "Find server" probes a short list of real candidates (the address
 * you already used, the host this page came from, then localhost) and only
 * accepts an answer that identifies itself as `aura-assist`. You can also type
 * an address and test it before saving.
 *
 * Saving re-points every service at once: the device bridge, the state stream
 * and the agent/MCP clients all read the address from here.
 */
export function ConnectionPanel({ open, onClose }) {
  const serverUrl = useRoomStore((s) => s.serverUrl)
  const bridgeStatus = useRoomStore((s) => s.bridgeStatus)
  const setConnection = useRoomStore((s) => s.setConnection)

  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(null) // 'scan' | 'test' | null
  const [result, setResult] = useState(null) // { ok, message }

  // Seed the input with the address actually in use whenever the panel opens.
  useEffect(() => {
    if (open) setDraft(useRoomStore.getState().serverUrl || '')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  /** Apply a chosen address everywhere and re-probe the device bridge. */
  const apply = async (url) => {
    const base = setBaseUrl(url)
    useRoomStore.getState().setConnection({ serverUrl: base, serverHost: describeBaseUrl() })
    await deviceService.reconnect?.()
    useRoomStore.setState({ backendLabel: deviceService.label })
    // A new EventSource must be built for the new host; a reload rebuilds the
    // stream and every other client through one code path.
    window.location.reload()
  }

  const scan = async () => {
    setBusy('scan')
    setResult(null)
    setConnection({ discovery: 'searching' })
    const found = await discover({ preferCurrent: false })
    setBusy(null)
    if (!found) {
      setConnection({ discovery: 'failed' })
      setResult({
        ok: false,
        message: 'No server answered. Start it with: python -m uvicorn server.main:app --host 0.0.0.0 --port 8000',
      })
      return
    }
    setConnection({ discovery: 'found' })
    setDraft(found.url || '')
    setResult({
      ok: true,
      message: `Found ${found.url || 'this machine'} · engine ${found.health.agent_engine}`,
    })
  }

  const test = async () => {
    setBusy('test')
    setResult(null)
    const outcome = await testConnection(draft)
    setBusy(null)
    setResult(
      outcome.ok
        ? { ok: true, message: `Reachable · engine ${outcome.health.agent_engine} · ${outcome.health.devices} devices` }
        : { ok: false, message: 'Nothing answered at that address.' }
    )
  }

  if (!open) return null

  const usingProxy = !serverUrl || isSameOrigin(serverUrl)

  return (
    <div className="conn" role="dialog" aria-label="AuraAssist server connection">
      <div className="conn__panel glass">
        <div className="conn__head">
          <span className="conn__badge"><Plug size={15} /></span>
          <div className="conn__id">
            <div className="conn__name">Server connection</div>
            <div className="conn__status">
              {bridgeStatus === 'online' ? 'Linked' : bridgeStatus} · {describeBaseUrl()}
            </div>
          </div>
          <button type="button" className="conn__tool" onClick={onClose} title="Close (Esc)" aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <p className="conn__help">
          Point this copy at the machine running <strong>AuraAssist</strong>. On that machine start the server with{' '}
          <code>--host 0.0.0.0</code> so other devices can reach it.
        </p>

        <div className="conn__row">
          <Server size={13} />
          <input
            className="conn__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="http://192.168.1.42:8000 (blank = this machine)"
            aria-label="Server address"
            spellCheck={false}
          />
        </div>

        <div className="conn__actions">
          <button type="button" className="conn__btn" onClick={test} disabled={Boolean(busy)}>
            {busy === 'test' ? <Loader2 size={13} className="conn__spin" /> : <Check size={13} />} Test
          </button>
          <button type="button" className="conn__btn" onClick={scan} disabled={Boolean(busy)}>
            {busy === 'scan' ? <Loader2 size={13} className="conn__spin" /> : <Radar size={13} />} Find server
          </button>
          <button type="button" className="conn__btn conn__btn--ok" onClick={() => apply(draft)} disabled={Boolean(busy)}>
            Use this
          </button>
        </div>

        {result && (
          <div className={`conn__result ${result.ok ? 'conn__result--ok' : 'conn__result--bad'}`}>
            {result.message}
          </div>
        )}

        <button
          type="button"
          className="conn__use-proxy"
          onClick={() => apply('')}
          disabled={Boolean(busy) || usingProxy}
        >
          {usingProxy ? 'Already using this machine' : 'Use this machine (dev proxy)'}
        </button>
      </div>
    </div>
  )
}
