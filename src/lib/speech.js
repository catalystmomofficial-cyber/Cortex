// Thin wrapper around the browser's built-in SpeechSynthesis (free, no key,
// no network) so the advisor can speak its replies aloud. We intentionally use
// the browser's DEFAULT voice — it's the clearest across devices. (A nicer
// dedicated voice will come with a proper TTS like Piper later.)

import { sharedAudioContext, resumeAudio } from './audio'

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
let currentSource = null // Web Audio source playing server TTS
let currentAudio = null // HTMLAudio element playing server TTS

// Use the VoxCPM server voice when enabled; otherwise the free browser voice.
const USE_VOXCPM =
  import.meta.env.VITE_VOXCPM === '1' || import.meta.env.VITE_VOXCPM === 'true'

function stopServerAudio() {
  if (currentSource) {
    try {
      currentSource.onended = null
      currentSource.stop()
    } catch {
      /* noop */
    }
    currentSource = null
  }
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

// Fire-and-forget: wake the Kokoro container when Voice Mode opens, so the
// first spoken reply comes back warm instead of missing the timeout and
// falling to the browser voice. Kokoro is CPU-cheap, so this costs nothing
// meaningful (unlike the old GPU pre-warm). Throttled to once a minute.
let warmed = 0
export function warmTTS() {
  if (!USE_VOXCPM) return
  const now = Date.now()
  if (now - warmed < 60000) return
  warmed = now
  fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Hi', language: 'en' }),
  }).catch(() => {})
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

// Server TTS via /api/tts (Kokoro/VoxCPM). Fetch the audio, then try TWO ways to
// play it before ever falling back to the robot voice:
//   1. Web Audio (AudioContext) — immune to Safari's autoplay-after-gap block.
//   2. A plain <audio> element — works on desktop Chrome even when the shared
//      AudioContext is stuck suspended by the mic pipeline.
// Only if BOTH fail (or the fetch does) do we use the browser voice. So the
// advisor is never silent, and real Jessica plays wherever either path works.
async function speakServer(text, opts = {}) {
  const { lang = 'en-US', onStart, onEnd } = opts
  // Stop anything currently playing WITHOUT bumping the session, then claim it.
  if (isSpeechSupported()) speechSynthesis.cancel()
  stopServerAudio()
  const mySession = ++speakSession

  let finished = false
  const finish = () => {
    if (finished || mySession !== speakSession) return
    finished = true
    onEnd?.()
  }
  const fallback = () => {
    if (finished || mySession !== speakSession) return
    finished = true
    speakBrowser(text, opts)
  }

  let blob
  try {
    const controller = new AbortController()
    // Give a warming Kokoro container room to answer (cold start ~8s with the
    // baked model) so the first reply is Jessica, not the browser fallback.
    const timer = setTimeout(() => controller.abort(), 20000)
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: lang }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error('tts ' + res.status)
      blob = await res.blob()
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return fallback() // server slow / unavailable
  }
  if (mySession !== speakSession) return
  if (!blob || !blob.size) return fallback()

  // ---- Attempt 1: Web Audio through the shared (unlocked) context ----
  const ctx = sharedAudioContext
  if (ctx) {
    try {
      await resumeAudio()
      if (mySession !== speakSession) return
      if (ctx.state === 'running') {
        const buffer = await ctx.decodeAudioData(await blob.arrayBuffer())
        if (mySession !== speakSession) return
        const src = ctx.createBufferSource()
        src.buffer = buffer
        src.connect(ctx.destination)
        currentSource = src
        src.onended = () => {
          if (currentSource === src) currentSource = null
          finish()
        }
        onStart?.()
        src.start()
        return
      }
    } catch {
      /* fall through to the <audio> element */
    }
  }

  // ---- Attempt 2: plain <audio> element ----
  try {
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    currentAudio = audio
    audio.onended = () => {
      if (currentAudio === audio) {
        URL.revokeObjectURL(url)
        currentAudio = null
      }
      finish()
    }
    audio.onerror = () => {
      if (currentAudio === audio) {
        URL.revokeObjectURL(url)
        currentAudio = null
      }
      fallback()
    }
    onStart?.()
    await audio.play()
  } catch {
    fallback() // autoplay blocked / element failed → robot, never silent
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
