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
let currentAudio = null // HTMLAudioElement playing server TTS

// Use the VoxCPM server voice when enabled; otherwise the free browser voice.
const USE_VOXCPM =
  import.meta.env.VITE_VOXCPM === '1' || import.meta.env.VITE_VOXCPM === 'true'

function stopServerAudio() {
  if (currentAudio) {
    try {
      currentAudio.onended = null
      currentAudio.onerror = null
      currentAudio.pause()
      if (currentAudio.src) URL.revokeObjectURL(currentAudio.src)
    } catch {
      /* noop */
    }
    currentAudio = null
  }
}

export function cancelSpeech() {
  speakSession++
  if (isSpeechSupported()) speechSynthesis.cancel()
  stopServerAudio()
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

// VoxCPM (or any server TTS via /api/tts) — plays returned audio with a plain
// <audio> element; falls back to the browser voice on ANY failure (slow cold
// start, non-200, decode/play error) so the advisor is never silent.
async function speakServer(text, opts = {}) {
  const { lang = 'en-US', onStart, onEnd } = opts
  // Stop anything currently playing WITHOUT bumping the session, then claim it.
  if (isSpeechSupported()) speechSynthesis.cancel()
  stopServerAudio()
  const mySession = ++speakSession

  let fellBack = false
  const fallback = () => {
    if (fellBack || mySession !== speakSession) return
    fellBack = true
    speakBrowser(text, opts)
  }

  try {
    const controller = new AbortController()
    // VoxCPM cold start can take minutes on free tier; don't wait in silence.
    // If it's slow, fall back to the browser voice fast.
    const timer = setTimeout(() => controller.abort(), 8000)
    let res
    try {
      res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: lang }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) throw new Error('tts ' + res.status)
    const blob = await res.blob()
    if (mySession !== speakSession) return
    if (!blob.size) throw new Error('empty audio')

    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    currentAudio = audio
    let ended = false
    audio.onended = () => {
      ended = true
      if (currentAudio === audio) {
        URL.revokeObjectURL(url)
        currentAudio = null
      }
      onEnd?.()
    }
    audio.onerror = () => {
      if (ended) return
      URL.revokeObjectURL(url)
      if (currentAudio === audio) currentAudio = null
      fallback()
    }
    onStart?.()
    // play() can reject (autoplay policy / not allowed) → fall back to browser.
    audio.play().catch(() => {
      if (ended) return
      URL.revokeObjectURL(url)
      if (currentAudio === audio) currentAudio = null
      fallback()
    })
  } catch {
    // VoxCPM unavailable/slow/non-200 → never go silent.
    fallback()
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
