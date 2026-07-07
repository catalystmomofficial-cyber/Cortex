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

// Server TTS via /api/tts (Kokoro/VoxCPM) — plays the returned audio through the
// shared AudioContext that was unlocked on the user's tap. Web Audio is immune
// to the autoplay block that rejects a plain <audio>.play() called seconds after
// the gesture (the reply streams in first). Falls back to the browser voice on
// ANY failure — slow cold start, non-200, empty/undecodable body, or a context
// that never resumed — so the advisor is never silent.
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
    // Cold start can be slow; don't wait in silence — fall back to the browser
    // voice fast (the GPU/CPU keeps warming, so the next reply uses the server).
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
    const arr = await res.arrayBuffer()
    if (mySession !== speakSession) return
    if (!arr.byteLength) throw new Error('empty audio')

    const ctx = sharedAudioContext
    if (!ctx) throw new Error('no audio context')
    // Resume the context (it was unlocked on the tap). If it still isn't
    // running, Web Audio would play silently — use the browser voice instead.
    await resumeAudio()
    if (mySession !== speakSession) return
    if (ctx.state !== 'running') throw new Error('audio context suspended')

    const buffer = await ctx.decodeAudioData(arr.slice(0))
    if (mySession !== speakSession) return

    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(ctx.destination)
    currentSource = src
    src.onended = () => {
      if (currentSource === src) currentSource = null
      onEnd?.()
    }
    onStart?.()
    src.start()
  } catch {
    // Server slow/unavailable, undecodable audio, or a suspended context →
    // never go silent.
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
