import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Check, Ear, Mic, MicOff, Plug, RotateCcw, Send, Terminal, X } from 'lucide-react'
import { invokeAgent, resetAgent, resetState, fetchHealth } from '../services/auraApi'
import { createMcpClient } from '../services/mcpClient'
import { createRecognizer, speak, stopSpeaking, voiceInputSupported, voiceOutputSupported } from '../services/speech'
import { useRoomStore } from '../store/useRoomStore'

// Suggestions for the user
const SUGGESTIONS = [
  'What\'s happening at home?',
  'Turn off the kitchen light',
  'Prepare for bed',
  'Lock the front door',
  'What\'s on the coffee table?',
  'Check the fridge',
]

/**
 * AuraAssist - the web client for the AuraAssist MCP server.
 *
 * Two tabs:
 *
 *  Chat   one conversational turn per message. The server runs its Bedrock
 *         agent, which executes tools on the MCP server; every tool call
 *         (name, arguments, result) is echoed back and rendered here, and the
 *         live state stream makes the 3D house follow whatever was done.
 *         Sensitive steps (unlock, routines) come back with Approve/Decline
 *         buttons - the guardrail is enforced on the server, this panel just
 *         answers it.
 *
 *  MCP    the browser acting as a real MCP client: it performs the
 *         initialize handshake against /mcp (Streamable HTTP, JSON-RPC),
 *         lists the eight tools, and can call any of them directly. Raw
 *         protocol frames are shown, which doubles as proof for the demo.
 *
 * The panel is a view of the same store the 3D scene uses, so nothing here
 * can disagree with the house.
 */

const SESSION_ID = 'web-sim'

/** Canned arguments per tool so the MCP tab can demo calls without typing JSON. */
const SAMPLE_ARGS = {
  get_home_snapshot: {},
  get_recent_events: { since_minutes: 480 },
  find_object: { object_name: 'phone' },
  describe_scene: { camera_id: 'living' },
  control_device: { device_id: 'tableLamp', action: 'toggle' },
  run_routine: { routine_name: 'bedtime', confirm: false },
  generate_daily_briefing: { audience: 'user' },
  set_user_preference: { key: 'preferred_temperature', value: '21' },
}

const shortArgs = (args) => {
  const text = JSON.stringify(args ?? {})
  return text.length > 96 ? `${text.slice(0, 93)}…` : text
}

/** Pull the readable text out of an MCP tool result ({content:[{text}]}) . */
const toolResultText = (result) => {
  if (!result) return ''
  if (result.isError) {
    const first = result.content?.[0]?.text
    return `error: ${first || 'tool failed'}`
  }
  const text = result.content?.map((c) => c.text).filter(Boolean).join(' ') || ''
  return text.length > 240 ? `${text.slice(0, 237)}…` : text
}

/* ------------------------------------------------------------------ chat tab */

function ChatTab({ busy, messages, awaiting, onSend, onAnswer }) {
  const logRef = useRef(null)

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    // Ensure scroll is at bottom on initial mount and when busy state changes
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [busy])

  return (
    <>
      <div className="aura__log scroll" ref={logRef}>
        {messages.map((m) => (
          <div key={m.id} className={`msg msg--${m.role === 'user' ? 'user' : 'alexa'} msg--aura`}>
            {m.text}
            {m.tools?.length > 0 && (
              <div className="aura__tools">
                {m.tools.map((t, i) => (
                  <div key={`${t.name}-${i}`} className="aura__tool-row" title={`${t.name}(${shortArgs(t.arguments)})`}>
                    <span className="aura__tool-name">{t.name}</span>
                    <span className="aura__tool-args">{shortArgs(t.arguments)}</span>
                    <span className="aura__tool-result">{t.result}</span>
                  </div>
                ))}
              </div>
            )}
            {m.engine && <span className="aura__engine">{m.engine}</span>}
          </div>
        ))}
        {busy && <div className="msg msg--alexa msg--busy msg--aura">Asking AuraAssist…</div>}
        {awaiting && (
          <div className="aura__confirm">
            <span className="aura__confirm-text">{awaiting}</span>
            <div className="aura__confirm-actions">
              <button type="button" className="aura__btn aura__btn--ok" onClick={() => onAnswer('yes')}>
                <Check size={13} /> Approve
              </button>
              <button type="button" className="aura__btn aura__btn--no" onClick={() => onAnswer('no')}>
                <X size={13} /> Decline
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="aura__chips">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="aura__chip" onClick={() => onSend(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------- mcp tab */

function McpTab() {
  const [status, setStatus] = useState('idle') // idle | connecting | ready | error
  const [info, setInfo] = useState(null)
  const [tools, setTools] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [running, setRunning] = useState(null)
  const [lastResult, setLastResult] = useState(null)
  const [frames, setFrames] = useState([])
  const clientRef = useRef(null)

  const refreshFrames = () => setFrames(clientRef.current?.frames.slice(-16).reverse() || [])

  const connect = async () => {
    setStatus('connecting')
    setLastResult(null)
    try {
      const client = createMcpClient()
      clientRef.current = client
      const init = await client.connect()
      const list = await client.listTools()
      setInfo(init)
      setTools(list)
      setSessionId(client.sessionId)
      setStatus('ready')
      refreshFrames()
    } catch (error) {
      setStatus('error')
      setLastResult(`handshake failed: ${error.message}`)
      refreshFrames()
    }
  }

  const call = async (tool) => {
    const client = clientRef.current
    if (!client) return
    setRunning(tool.name)
    setLastResult(null)
    try {
      const result = await client.callTool(tool.name, SAMPLE_ARGS[tool.name] ?? {})
      setLastResult(toolResultText(result))
    } catch (error) {
      setLastResult(`error: ${error.message}`)
    } finally {
      setRunning(null)
      refreshFrames()
    }
  }

  return (
    <div className="aura__mcp">
      <div className="aura__mcp-head">
        <span className={`aura__dot aura__dot--${status}`} />
        <span className="aura__mcp-state">
          {status === 'ready'
            ? `${info?.serverInfo?.name || 'aura-assist'} v${info?.serverInfo?.version || '?'} · ${tools.length} tools · session ${sessionId?.slice(0, 8)}…`
            : status === 'connecting'
              ? 'initialize → tools/list …'
              : status === 'error'
                ? 'handshake failed'
                : 'MCP endpoint /mcp (Streamable HTTP)'}
        </span>
        <button type="button" className="aura__btn" onClick={connect} disabled={status === 'connecting'}>
          {status === 'ready' ? 'Reconnect' : 'Connect'}
        </button>
      </div>

      <div className="aura__mcp-body scroll">
        {status === 'ready' && (
          <div className="aura__tool-list">
            {tools.map((t) => (
              <div key={t.name} className="aura__tool-item" title={t.description}>
                <div className="aura__tool-item-name">{t.name}</div>
                <div className="aura__tool-item-desc">{t.description}</div>
                <div className="aura__tool-item-call">
                  <code>{shortArgs(SAMPLE_ARGS[t.name] ?? {})}</code>
                  <button
                    type="button"
                    className="aura__btn aura__btn--ok"
                    onClick={() => call(t)}
                    disabled={running === t.name}
                  >
                    {running === t.name ? '…' : 'call'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {lastResult && <pre className="aura__result">{lastResult}</pre>}

        <div className="aura__frames">
          {frames.map((f, i) => (
            <div key={`${f.at}-${i}`} className={`aura__frame aura__frame--${f.direction}`}>
              <span className="aura__frame-dir">{f.direction === 'out' ? '→' : '←'}</span>
              <span className="aura__frame-body">
                {JSON.stringify(f.payload).length > 120
                  ? `${JSON.stringify(f.payload).slice(0, 117)}…`
                  : JSON.stringify(f.payload)}
              </span>
            </div>
          ))}
          {frames.length === 0 && (
            <div className="aura__frame aura__frame--idle">
              JSON-RPC frames appear here once you connect (initialize, tools/list, tools/call).
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------- panel */

export function AuraChat() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('chat')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [online, setOnline] = useState(null) // null = checking, true/false
  const [engine, setEngine] = useState(null)
  const [messages, setMessages] = useState([
    {
      id: 'intro',
      role: 'assistant',
      text: 'AuraAssist is online. Ask about the house, or control devices through me - the tool log below shows every MCP call I make.',
    },
  ])
  const [awaiting, setAwaiting] = useState(null)
  const inputRef = useRef(null)
  const msgId = useRef(1)
  
  // Voice recognition support
  const pushRecRef = useRef(null)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [note, setNote] = useState('')
  
  /* Probe the server once so the panel can be honest about being offline. */
  useEffect(() => {
    let cancelled = false
    fetchHealth()
      .then((health) => {
        if (cancelled) return
        setOnline(true)
        setEngine(health.agent_engine)
      })
      .catch(() => !cancelled && setOnline(false))
    return () => { cancelled = true }
  }, [])

  const push = (entry) => setMessages((m) => [...m, { id: msgId.current++, ...entry }])

  const send = async (text) => {
    const message = (text ?? draft).trim()
    if (!message || busy) return
    setDraft('')
    setOnline(true)
    push({ role: 'user', text: message })
    setBusy(true)
    try {
      const turn = await invokeAgent(message, SESSION_ID)
      setEngine(turn.engine)
      setAwaiting(turn.needs_user_input ? turn.pending : null)
      push({
        role: 'assistant',
        text: turn.reply,
        tools: turn.tool_calls || [],
        engine: turn.engine,
      })
      if (voiceOutputSupported) speak(turn.reply)
    } catch (error) {
      setOnline(false)
      push({
        role: 'assistant',
        text: `I can't reach the AuraAssist server (${error.message}). Start it with: python -m uvicorn server.main:app --port 8000`,
      })
      if (voiceOutputSupported) speak(`I can't reach the server right now.`)
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const answer = (text) => {
    setAwaiting(null)
    send(text)
  }

  // Voice recognition handler - must come after send() is defined
  const stopListening = useCallback(() => {
    pushRecRef.current?.stop()
    setListening(false)
  }, [])

  const startListening = useCallback(() => {
    if (!voiceInputSupported) {
      setNote('Microphone not supported in this browser')
      return
    }
    stopSpeaking()
    setInterim('')
    setNote('')
    const rec = createRecognizer({
      onInterim: (t) => setInterim(t),
      onFinal: (t) => { 
        setInterim('')
        if (!busy) send(t)
        rec.stop() 
      },
      onEnd: () => { 
        setListening(false)
        setInterim('')
      },
      onError: (error) => {
        if (error === 'not-allowed' || error === 'service-not-allowed') {
          setNote('Microphone blocked - allow mic access, or just type.')
        }
      },
    })
    if (!rec) {
      setNote('Microphone not supported in this browser')
      return
    }
    pushRecRef.current = rec
    setListening(true)
    rec.start()
  }, [busy, send, stopSpeaking])

  useEffect(() => () => { stopSpeaking() }, [])

  /* Open with "a" when nothing else is being typed into. */
  useEffect(() => {
    const onKey = (event) => {
      if (open || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (typing || useRoomStore.getState().walkLocked) return
      if (event.key.toLowerCase() === 'a') {
        setOpen(true)
        setTab('chat')
        setTimeout(() => inputRef.current?.focus(), 30)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const resetAll = async () => {
    setAwaiting(null)
    await Promise.all([resetAgent(SESSION_ID), resetState()])
    setMessages([{ id: msgId.current++, role: 'nova', text: 'Fresh start: conversation and house state reset.' }])
  }

  const statusLine = online === false
    ? 'server offline - start aura-assist on :8000'
    : busy
      ? 'thinking…'
      : engine
        ? `Bedrock agent · MCP server · press A to reopen`
        : 'checking server…'

  const submit = (event) => {
    event.preventDefault()
    send()
  }

  return (
    <div className="aura">
      {!open && (
        <button
          type="button"
          className="aura__orb"
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 30) }}
          title="AuraAssist - the MCP-powered assistant (A)"
          aria-label="Open AuraAssist"
        >
          <Bot size={19} />
          <span className="aura__orb-label">AuraAssist</span>
          {online === false && <span className="aura__orb-warn" />}
        </button>
      )}

      {open && (
        <div className="aura__panel glass" role="dialog" aria-label="AuraAssist assistant">
          <div className="aura__head">
            <span className="aura__badge"><Bot size={15} /></span>
            <div className="aura__id">
              <div className="aura__name">AuraAssist</div>
              <div className="aura__status">{statusLine}</div>
            </div>
            <div className="aura__tabs">
              <button
                type="button"
                className={`aura__tab ${tab === 'chat' ? 'aura__tab--on' : ''}`}
                onClick={() => setTab('chat')}
                title="Chat with the agent"
              >
                <Send size={12} /> Chat
              </button>
              <button
                type="button"
                className={`aura__tab ${tab === 'mcp' ? 'aura__tab--on' : ''}`}
                onClick={() => setTab('mcp')}
                title="Browser as a raw MCP client"
              >
                <Plug size={12} /> MCP
              </button>
            </div>
            <button type="button" className="aura__tool" onClick={resetAll} title="Reset the demo (state + chat)" aria-label="Reset demo">
              <RotateCcw size={14} />
            </button>
            <button type="button" className="aura__tool" onClick={() => setOpen(false)} title="Close (Esc)" aria-label="Close">
              <X size={15} />
            </button>
          </div>

          {tab === 'chat' ? (
            <>
              <ChatTab busy={busy} messages={messages} awaiting={awaiting} onSend={send} onAnswer={answer} />
              <form className="aura__form" onSubmit={submit}>
                <input
                  ref={inputRef}
                  className="aura__input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={voiceInputSupported ? 'Ask the house, or tap the mic' : 'Ask the house - e.g. "prepare for bed"'}
                  aria-label="Ask AuraAssist"
                />
                {voiceInputSupported && (
                  <button
                    type="button"
                    className={`aura__mic ${listening ? 'aura__mic--on' : ''}`}
                    onClick={() => (listening ? stopListening() : startListening())}
                    disabled={busy}
                    title="Push to talk (auto-submits when speech ends)"
                    aria-label="Push to talk"
                  >
                    {listening ? <MicOff size={15} /> : <Mic size={15} />}
                  </button>
                )}
                <button type="submit" className="aura__send" title="Send" aria-label="Send" disabled={busy}>
                  <Send size={15} />
                </button>
              </form>
              {interim && <span className="aura__interim">{interim}…</span>}
              {note && <span className="aura__note">{note}</span>}
            </>
          ) : (
            <McpTab />
          )}

          {tab === 'chat' && engine && (
            <div className="aura__hint">
              <Terminal size={10} /> Every action runs on the MCP server: the model only decides, deterministic code executes.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
