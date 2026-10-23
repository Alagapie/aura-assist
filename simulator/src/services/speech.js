/**
 * Browser speech I/O for the Alexa assistant.
 *
 * Voice output uses the built-in `speechSynthesis` engine and voice input uses
 * `SpeechRecognition` (Chrome / Edge ship it; Firefox does not). Both are free,
 * on-device-ish and need no API keys, which keeps the project dependency-free -
 * the same rule the rest of the simulator follows. The assistant UI degrades
 * gracefully: when voice input is unavailable it simply becomes a text chat.
 *
 * NOTE: Chrome's recogniser is "continuous-free" by spec but does accept
 * `continuous = true`; when the tab is hidden or the stream ends it stops, so
 * the caller restarts it (see VoiceAssistant's wake loop).
 */

const getRecognition = () =>
  (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null

export const voiceInputSupported = !!getRecognition()
export const voiceOutputSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

/* ------------------------------------------------------------------ speech */

let cachedVoice = null

/**
 * Score a voice so we can pick the most natural-sounding one available.
 * Higher is better.
 */
function scoreVoice(v) {
  const n = v.name.toLowerCase()
  // Top tier: Microsoft Neural / Google online voices
  if (/aria|jenny|natasha|sonia|libby|ryan|guy|neural/i.test(n) && v.localService === false) return 100
  if (/google us english|google uk english/i.test(n)) return 90
  // Second tier: quality named offline voices
  if (/aria|jenny|sonia|libby/i.test(n)) return 80
  if (/zira|david|hazel|mark|susan|karen|daniel|moira/i.test(n)) return 70
  if (/samantha|alex|victoria|serena|fiona/i.test(n)) return 65
  // Third tier: any online English voice
  if (/^en/i.test(v.lang) && v.localService === false) return 50
  // Fourth tier: any English voice
  if (/^en/i.test(v.lang)) return 30
  return 0
}

function pickVoice() {
  if (!voiceOutputSupported) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  const english = voices.filter((v) => /^en/i.test(v.lang))
  const pool = english.length ? english : voices
  // Sort by score, pick the best
  const sorted = [...pool].sort((a, b) => scoreVoice(b) - scoreVoice(a))
  return sorted[0] || pool[0]
}

if (voiceOutputSupported) {
  // Voices load asynchronously in most browsers; refresh the cache when they arrive.
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null // force re-pick on next speak() so we always get the best available
    cachedVoice = pickVoice()
  }
}

/** Speak `text`, resolving when the utterance finishes (or fails / is cancelled). */
export function speak(text, { rate = 1.0, pitch = 1.0 } = {}) {
  if (!voiceOutputSupported || !text) return Promise.resolve()
  window.speechSynthesis.cancel()
  return new Promise((resolve) => {
    // A short delay avoids a Chrome bug where cancel() + speak() too fast drops the utterance.
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = rate
      utterance.pitch = pitch
      utterance.lang = 'en-US'
      utterance.voice = cachedVoice || (cachedVoice = pickVoice())
      utterance.onend = resolve
      utterance.onerror = resolve
      window.speechSynthesis.speak(utterance)
    }, 50)
  })
}


/** Stop any reply currently being spoken (e.g. so the mic can hear you). */
export function stopSpeaking() {
  if (voiceOutputSupported) window.speechSynthesis.cancel()
}

/* ------------------------------------------------------------------ listen */

/**
 * Create a one-line recogniser wrapper.
 *
 * @param {object} callbacks
 * @param {(text: string) => void} callbacks.onFinal    a finalised utterance
 * @param {(text: string) => void} callbacks.onInterim  live partial results
 * @param {() => void}             callbacks.onEnd      recogniser stopped
 * @param {(error: string) => void} callbacks.onError   recogniser error name
 */
export function createRecognizer({ lang = 'en-US', continuous = false, interimResults = true, onFinal, onInterim, onEnd, onError } = {}) {
  const Recognition = getRecognition()
  if (!Recognition) return null

  const recognition = new Recognition()
  recognition.lang = lang
  recognition.continuous = continuous
  recognition.interimResults = interimResults
  recognition.maxAlternatives = 1

  recognition.onresult = (event) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i]
      if (result.isFinal) {
        const text = result[0].transcript.trim()
        if (text) onFinal?.(text)
      } else {
        interim += result[0].transcript
      }
    }
    if (interim.trim()) onInterim?.(interim.trim())
  }
  recognition.onerror = (event) => onError?.(event.error || 'unknown')
  recognition.onend = () => onEnd?.()

  return {
    start() {
      try { recognition.start() } catch { /* already started */ }
    },
    stop() {
      try { recognition.stop() } catch { /* not started */ }
    },
    abort() {
      try { recognition.abort() } catch { /* not started */ }
    },
  }
}

/**
 * A recogniser that keeps itself alive.
 *
 * Chrome ends a continuous recognition session every few minutes (and on
 * tab blur), so a "always listening" assistant has to restart it. This wrapper
 * does that for you: whenever the browser ends the session, it starts a fresh
 * one, unless the caller asked it to stop.
 *
 * @param {object} options
 * @param {number} [options.restartDelayMs=250]  pause before restarting
 * @param {boolean} [options.restart=true]      set false to stop auto-restart
 * @param {() => boolean} [options.shouldRestart] extra gate (e.g. not speaking)
 */
export function createRestartableRecognizer({ lang = 'en-US', continuous = true, interimResults = true, onFinal, onInterim, onEnd, onError, restartDelayMs = 250, shouldRestart } = {}) {
  const Recognition = getRecognition()
  if (!Recognition) return null

  let wanted = false
  let recognition = null
  let timer = null

  const build = () => {
    const rec = new Recognition()
    rec.lang = lang
    rec.continuous = continuous
    rec.interimResults = interimResults
    rec.maxAlternatives = 1

    rec.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result.isFinal) {
          const text = result[0].transcript.trim()
          if (text) onFinal?.(text)
        } else {
          interim += result[0].transcript
        }
      }
      if (interim.trim()) onInterim?.(interim.trim())
    }

    rec.onerror = (event) => {
      const error = event.error || 'unknown'
      // "no-speech" / "aborted" are routine - the restart loop handles them.
      if (error !== 'no-speech' && error !== 'aborted') onError?.(error)
      if (error === 'not-allowed' || error === 'service-not-allowed') {
        wanted = false
      }
    }

    rec.onend = () => {
      onEnd?.()
      if (!wanted) return
      if (shouldRestart && shouldRestart() === false) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (!wanted) return
        try { rec.start() } catch { /* already started */ }
      }, restartDelayMs)
    }
    return rec
  }

  recognition = build()

  return {
    start() {
      wanted = true
      try { recognition.start() } catch { /* already started */ }
    },
    stop() {
      wanted = false
      window.clearTimeout(timer)
      try { recognition.stop() } catch { /* not started */ }
    },
    abort() {
      wanted = false
      window.clearTimeout(timer)
      try { recognition.abort() } catch { /* not started */ }
    },
    /** True while the wrapper is armed (it will restart itself when it ends). */
    get listening() {
      return wanted
    },
  }
}
