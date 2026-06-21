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

// VoxCPM (or any server TTS via /api/tts) — plays returned audio; falls back to
// the browser voice on any failure so a demo never goes silent.
async function speakServer(text, { lang = 'en-US', onStart, onEnd } = {}) {
  // Stop anything currently playing WITHOUT bumping the session, then claim it.
  if (isSpeechSupported()) speechSynthesis.cancel()
  stopServerAudio()
  const mySession = ++speakSession

  const ctx = sharedAudioContext
  if (!ctx) {
    speakBrowser(text, { lang, onStart, onEnd })
    return
  }

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: lang }),
    })
    if (!res.ok) throw new Error('tts ' + res.status)
    const arr = await res.arrayBuffer()
    if (mySession !== speakSession) return

    // Decode + play through the shared (user-unlocked) audio engine, which
    // avoids autoplay blocks that bite a plain <audio>.play().
    await resumeAudio()
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
    // VoxCPM unavailable/slow or undecodable → never go silent.
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
