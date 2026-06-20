// Thin wrapper around the browser's built-in SpeechSynthesis (free, no key,
// no network) so the advisor can speak its replies aloud. We intentionally use
// the browser's DEFAULT voice — it's the clearest across devices. (A nicer
// dedicated voice will come with a proper TTS like Piper later.)



export function isSpeechSupported() {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'
}

// iOS only allows speechSynthesis after it's first triggered inside a user
// gesture. Call this from a tap handler once to "unlock" it.
let unlocked = false
export function unlockSpeech() {
  if (unlocked || !isSpeechSupported()) return
  unlocked = true
  try {
    const u = new SpeechSynthesisUtterance('')
    u.volume = 0
    speechSynthesis.speak(u)
  } catch {
    /* noop */
  }
}

// Bumping the session supersedes/cancels any in-flight chunk queue.
let speakSession = 0
let currentAudio = null

// Use the VoxCPM server voice when enabled; otherwise the free browser voice.
const USE_VOXCPM =
  import.meta.env.VITE_VOXCPM === '1' || import.meta.env.VITE_VOXCPM === 'true'

export function cancelSpeech() {
  speakSession++
  if (isSpeechSupported()) speechSynthesis.cancel()
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio = null
  }
}

// Split into sentence-ish chunks (<=~200 chars). Chrome stops speaking a single
// long utterance after ~15s, so we queue shorter ones to avoid the cutoff.
function chunkText(text) {
  const parts = text.match(/[^.!?。！？\n]+[.!?。！？\n]*/g) || [text]
  const chunks = []
  let cur = ''
  for (const p of parts) {
    if ((cur + p).length > 200 && cur) {
      chunks.push(cur.trim())
      cur = p
    } else {
      cur += p
    }
  }
  if (cur.trim()) chunks.push(cur.trim())
  return chunks
}

/**
 * Speak some text aloud (queued in chunks for reliability).
 * @param {string} text
 * @param {object} [cb]
 * @param {string} [cb.lang]
 * @param {()=>void} [cb.onStart]
 * @param {()=>void} [cb.onBoundary] - fires per word/sentence
 * @param {()=>void} [cb.onEnd] - fires once, after the last chunk
 */
export function speak(text, opts = {}) {
  if (!text) {
    opts.onEnd?.()
    return
  }
  if (USE_VOXCPM) {
    speakServer(text, opts)
    return
  }
  speakBrowser(text, opts)
}

// VoxCPM (or any server TTS via /api/tts) — plays returned audio; falls back to
// the browser voice on any failure so a demo never goes silent.
async function speakServer(text, { lang = 'en-US', onStart, onEnd } = {}) {
  const mySession = ++speakSession
  cancelSpeech()
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: lang }),
    })
    if (!res.ok) throw new Error('tts')
    const blob = await res.blob()
    if (mySession !== speakSession) return
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    currentAudio = audio
    audio.onplay = () => onStart?.()
    audio.onended = () => {
      URL.revokeObjectURL(url)
      if (currentAudio === audio) currentAudio = null
      onEnd?.()
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      onEnd?.()
    }
    await audio.play()
  } catch {
    speakBrowser(text, { lang, onStart, onEnd })
  }
}

function speakBrowser(text, { lang = 'en-US', onStart, onBoundary, onEnd } = {}) {
  if (!isSpeechSupported()) {
    onEnd?.()
    return
  }
  const mySession = ++speakSession
  speechSynthesis.cancel()

  const chunks = chunkText(text)
  let i = 0
  let started = false

  function next() {
    if (mySession !== speakSession) return // superseded or cancelled
    if (i >= chunks.length) {
      onEnd?.()
      return
    }
    const u = new SpeechSynthesisUtterance(chunks[i++])
    // Use the browser's default voice (clearest); only nudge the language.
    u.lang = lang
    u.rate = 1.0
    u.pitch = 1.0
    u.onstart = () => {
      if (!started) {
        started = true
        onStart?.()
      }
    }
    u.onboundary = () => onBoundary?.()
    u.onend = () => next()
    u.onerror = () => next()
    speechSynthesis.speak(u)
  }

  next()
}
