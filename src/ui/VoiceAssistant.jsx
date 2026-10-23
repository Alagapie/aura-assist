import { useCallback, useEffect, useRef, useState } from 'react'
import { Ear, Mic, MicOff, Send, Sparkles, X } from 'lucide-react'
import { useRoomStore } from '../store/useRoomStore'
import { invokeAgent } from '../services/auraApi'
import {
  createRecognizer, speak, stopSpeaking, voiceInputSupported, voiceOutputSupported,
} from '../services/speech'

/**
 * AuraAssist Voice Assistant - uses the same AuraAssist Amazon Bedrock agent
 * as the text chat, with speech recognition and text-to-speech.
 *
 * This is NOT the rule-based brain.js assistant. All intelligent processing
 * happens on the server using the Bedrock agent and MCP tools.
 *
 * Push the mic and talk, type into the box, or arm the wake word and keep
 * saying "Hey Alexa".
 */

const WAKE_WORDS = /^(?:hey |ok |okay |yo |hi |good morning |computer )?(?:alexa|computer)\b[,.!?…]?\s*/i

const SUGGESTIONS = [
  'Movie mode', 'Good night', 'Turn off everything', "What's on?",
  'Go to the kitchen', 'Open the curtains', 'Set the AC to 21 degrees',
]

let chatId = 0

const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

export function VoiceAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { id: ++chatId, role: 'assistant', text: `Hi! I'm AuraAssist, your context-aware home companion. You can ask about your surroundings, control your home, or start a routine. What would you like to do? Try: "movie mode", "good night", "what's on?"` },
  ])
  const [draft, setDraft] = useState('')
  const [interim, setInterim] = useState('')
  const [listening, setListening] = useState(false)
  const [wakeOn, setWakeOn] = useState(true)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('idle')
  const [pendingRoutine, setPendingRoutine] = useState(null)
  const [pendingActions, setPendingActions] = useState([])

  const logRef = useRef(null)
  const inputRef = useRef(null)
  const pushRecRef = useRef(null)
  const wakeRecRef = useRef(null)
  const wakeWantedRef = useRef(false)
  const wakeSuspendedRef = useRef(false)
  const armUntilRef = useRef(0)
  const guardRef = useRef(0)
  const handleCommandRef = useRef(null)

  const addMessage = useCallback((role, text) => {
    setMessages((prev) => [...prev.slice(-39), { id: ++chatId, role, text }])
  }, [])

  /* ------------------------------------------------------------- commands */

  const handleCommand = useCallback(async (text) => {
    const question = String(text || '').trim()
    if (!question) return
    addMessage('user', question)
    
    setStatus('thinking')
    setBusy(true)

    try {
      let reply = ''
      let needsConfirmation = false

      // Use AuraAssist agent for ALL commands (voice or text)
      setBusy(true)
      try {
        const turn = await invokeAgent(question, 'voice-sim')
        reply = turn.reply || 'I executed that command.'
        needsConfirmation = !!turn.needs_user_input
        
        // Store pending routine for action list display
        if (needsConfirmation) {
          setPendingRoutine(question)
          setPendingActions(turn.actions || [])
        } else {
          setPendingRoutine(null)
          setPendingActions([])
        }

        // Log tool calls
        for (const call of turn.tool_calls || []) {
          useRoomStore.getState().pushLog({
            level: 'info',
            text: `Voice · ${call.name}${call.result ? ` · ${call.result}` : ''}`,
          })
        }

        setBusy(false)
      } catch (error) {
        reply = `I couldn't reach AuraAssist - ${error.message}`
        setBusy(false)
      }

      // Speak the reply
      if (voiceOutputSupported && reply) {
        wakeSuspendedRef.current = true
        wakeRecRef.current?.stop()
        await speak(reply)
        wakeSuspendedRef.current = false
        if (wakeWantedRef.current) wakeRecRef.current?.start()
      }

      addMessage('assistant', reply)

      // Show confirmation if needed
      if (needsConfirmation) {
        // We show this in the chat log instead of adding a separate message
        // The user will confirm by typing "yes"
      }

    } catch (error) {
      const fallback = `I couldn't process that - ${error.message}`
      addMessage('assistant', fallback)
      if (voiceOutputSupported) speak(fallback)
    } finally {
      setBusy(false)
      setStatus('idle')
    }
  }, [addMessage])

  handleCommandRef.current = handleCommand

  /* ---------------------------------------------------------- push to talk */

  const stopListening = useCallback(() => {
    pushRecRef.current?.stop()
    setListening(false)
  }, [])

  const startListening = useCallback(() => {
    if (!voiceInputSupported) { inputRef.current?.focus(); return }
    stopSpeaking()
    setInterim('')
    setNote('')
    const rec = createRecognizer({
      onInterim: (t) => setInterim(t),
      onFinal: (t) => { 
        setInterim('')
        if (!busy) handleCommandRef.current?.(t)
        rec.stop() 
      },
      onEnd: () => { 
        setListening(false)
        setInterim('')
        clearTimeout(guardRef.current) 
      },
      onError: (error) => {
        if (error === 'not-allowed' || error === 'service-not-allowed') {
          setNote('Microphone blocked - allow mic access, or just type.')
        }
      },
    })
    if (!rec) return
    pushRecRef.current = rec
    setListening(true)
    rec.start()
    guardRef.current = setTimeout(() => rec.stop(), 9000)
  }, [busy])

  /* ------------------------------------------------------------- wake word */

  const startWake = useCallback(() => {
    if (!voiceInputSupported) return
    wakeWantedRef.current = true
    const rec = createRecognizer({
      continuous: true,
      interimResults: true,
      onInterim: (t) => setInterim(t),
      onFinal: (t) => {
        setInterim('')
        const stripped = t.replace(WAKE_WORDS, '')
        if (stripped.toLowerCase() !== t.toLowerCase()) {
          if (stripped.trim() && !busy) {
            handleCommandRef.current?.(stripped.trim())
          } else if (!busy) {
            armUntilRef.current = Date.now() + 12000
            const wakeResponses = ["Yes?", "Go ahead.", "I'm listening.", "Yes, I'm here."]
            const reply = wakeResponses[Math.floor(Math.random() * wakeResponses.length)]
            wakeSuspendedRef.current = true
            wakeRecRef.current?.stop()
            speak(reply).then(() => {
              wakeSuspendedRef.current = false
              if (wakeWantedRef.current) wakeRecRef.current?.start()
            })
          }
        } else if (Date.now() < armUntilRef.current && !busy) {
          armUntilRef.current = 0
          handleCommandRef.current?.(t)
        }
      },
      onEnd: () => {
        if (wakeWantedRef.current && !wakeSuspendedRef.current) rec.start()
      },
      onError: (error) => {
        if (error === 'not-allowed' || error === 'service-not-allowed' || error === 'audio-capture') {
          wakeWantedRef.current = false
          setWakeOn(false)
          setNote('Microphone blocked - allow mic access to use the wake word.')
        }
      },
    })
    if (!rec) { setWakeOn(false); return }
    wakeRecRef.current = rec
    rec.start()
  }, [busy])

  const stopWake = useCallback(() => {
    wakeWantedRef.current = false
    armUntilRef.current = 0
    wakeRecRef.current?.abort()
    wakeRecRef.current = null
  }, [])

  useEffect(() => {
    if (wakeOn) startWake()
    else stopWake()
    return stopWake
  }, [wakeOn, startWake, stopWake])

  /* --------------------------------------------------------------- layout */

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [messages, interim, busy])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
      if (event.key.toLowerCase() === 'v' && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(document.activeElement)) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    const onKey = (event) => {
      if (open || event.key.toLowerCase() !== 'v' || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTyping(document.activeElement) || useRoomStore.getState().walkLocked) return
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => () => { stopSpeaking() }, [])

  const statusLine = busy
    ? 'Thinking…'
    : listening
      ? 'Listening…'
      : wakeOn
        ? 'Always listening for "Hey Alexa"'
        : 'Ask me anything - or push the mic'

  const submit = (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    
    // Handle confirmation
    if (pendingRoutine) {
      setDraft('')
      // Execute the pending routine with explicit yes
      const approvedText = `yes, ${pendingRoutine}`
      setPendingRoutine(null)
      setPendingActions([])
      handleCommand(approvedText)
      return
    }
    
    setDraft('')
    handleCommand(text)
  }

  const micTitle = voiceInputSupported ? 'Push to talk' : 'Voice input needs Chrome or Edge'

  return (
    <div className="alexa">
      {!open && (
        <button
          type="button"
          className={`alexa__orb ${listening || busy ? 'alexa__orb--active' : ''} ${wakeOn ? 'alexa__orb--armed' : ''}`}
          onClick={() => { setOpen(true); inputRef.current?.focus() }}
          title={`${ASSISTANT_NAME} - voice assistant (V)`}
          aria-label="Open the voice assistant"
        >
          <Sparkles size={21} />
        </button>
      )}

      {open && (
        <div className="alexa__panel glass" role="dialog" aria-label={`${ASSISTANT_NAME} voice assistant`}>
          <div className="alexa__head">
            <span className="alexa__badge"><Sparkles size={15} /></span>
            <div className="alexa__id">
              <div className="alexa__name">{ASSISTANT_NAME}</div>
              <div className="alexa__status">{statusLine}</div>
            </div>
            {voiceInputSupported && (
              <button
                type="button"
                className={`alexa__tool ${wakeOn ? 'alexa__tool--on' : ''}`}
                onClick={() => setWakeOn((v) => !v)}
                title={'Listen continuously for "Hey Alexa"'}
                aria-label="Toggle the wake word"
              >
                <Ear size={15} />
              </button>
            )}
            <button
              type="button"
              className="alexa__tool"
              onClick={() => setOpen(false)}
              title="Close (Esc)"
              aria-label="Close the assistant"
            >
              <X size={15} />
            </button>
          </div>

          <div className="alexa__log scroll" ref={logRef}>
            {messages.map((m) => (
              <div key={m.id} className={`msg msg--${m.role}`}>{m.text}</div>
            ))}
            {busy && <div className="msg msg--alexa msg--busy">Thinking…</div>}
            {interim && <div className="msg msg--interim">{interim}…</div>}
            
            {/* Show pending routine confirmation with action list */}
            {pendingRoutine && pendingActions.length > 0 && (
              <div className="msg msg--alexa msg--pending aura__pending">
                <div className="aura__pending-header">Ready to execute</div>
                <div className="aura__pending-actions">
                  {pendingActions.slice(0, 6).map((action, idx) => (
                    <div key={idx} className="aura__pending-action">{action.description}</div>
                  ))}
                  {pendingActions.length > 6 && (
                    <div className="aura__pending-more">+ {pendingActions.length - 6} more</div>
                  )}
                </div>
                <div className="aura__pending-actions">
                  <button type="button" onClick={() => {
                    // When user clicks YES, we just submit with empty draft
                    // which triggers the submit handler with pending info
                    document.querySelector('.alexa__input')?.focus()
                    document.querySelector('.alexa__form')?.requestSubmit()
                  }}>Yes, proceed</button>
                  <button type="button" onClick={() => {
                    setPendingRoutine(null)
                    setPendingActions([])
                    addMessage('alexa', 'Cancelled - nothing was changed.')
                  }}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          <div className="alexa__chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="alexa__chip" onClick={() => handleCommand(s)} disabled={busy}>{s}</button>
            ))}
          </div>

          <form className="alexa__form" onSubmit={submit}>
            <input
              ref={inputRef}
              className="alexa__input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Say it or type it - e.g. "lights out"`}
              aria-label={`Ask ${ASSISTANT_NAME}`}
              disabled={busy}
            />
            <button
              type="button"
              className={`alexa__mic ${listening ? 'alexa__mic--on' : ''}`}
              onClick={() => (listening ? stopListening() : startListening())}
              disabled={!voiceInputSupported}
              title={micTitle}
              aria-label="Push to talk"
            >
              {listening ? <MicOff size={15} /> : <Mic size={15} />}
            </button>
            <button type="submit" className="alexa__send" title="Send" aria-label="Send">
              <Send size={15} />
            </button>
          </form>

          {note && <div className="alexa__hint">{note}</div>}
          {!note && !voiceInputSupported && (
            <div className="alexa__hint">Voice input needs Chrome or Edge - typing works everywhere.</div>
          )}
        </div>
      )}
    </div>
  )
}
