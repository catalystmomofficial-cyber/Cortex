// Thin wrapper around the browser's built-in SpeechSynthesis (free, no key,
// no network) so the advisor can speak its replies aloud.

let voicesCache = []

function loadVoices() {
  if (typeof speechSynthesis === 'undefined') return []
  voicesCache = speechSynthesis.getVoices() || []
  return voicesCache
}

if (typeof speechSynthesis !== 'undefined') {
  loadVoices()
  speechSynthesis.onvoiceschanged = loadVoices
}

// Pick the nicest available voice for a given BCP-47 language (e.g. 'fil-PH').
// Prefers higher-quality "Google"/"Natural"/"Premium" voices, matches the
// language, and falls back gracefully so multilingual output still speaks.
function pickVoice(lang = 'en-US') {
  const voices = voicesCache.length ? voicesCache : loadVoices()
  if (!voices.length) return null

  const base = (lang || 'en-US').slice(0, 2).toLowerCase()
  const sameLang = voices.filter((v) => (v.lang || '').toLowerCase().startsWith(base))
  const pool = sameLang.length ? sameLang : voices

  const score = (v) => {
    const n = (v.name || '').toLowerCase()
    let s = 0
    if (/google/.test(n)) s += 5
    if (/natural|premium|enhanced|neural/.test(n)) s += 4
    if (/(^|\W)(female|samantha|aria|jenny|rosa)\b/.test(n)) s += 1
    if (v.localService === false) s += 1 // network voices are usually richer
    if ((v.lang || '').toLowerCase() === (lang || '').toLowerCase()) s += 2 // exact region
    return s
  }

  return [...pool].sort((a, b) => score(b) - score(a))[0] || voices[0] || null
}

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

export function cancelSpeech() {
  speakSession++
  if (isSpeechSupported()) speechSynthesis.cancel()
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
export function speak(text, { lang = 'en-US', onStart, onBoundary, onEnd } = {}) {
  if (!isSpeechSupported() || !text) {
    onEnd?.()
    return
  }
  const mySession = ++speakSession
  speechSynthesis.cancel()

  const chunks = chunkText(text)
  const v = pickVoice(lang)
  let i = 0
  let started = false

  function next() {
    if (mySession !== speakSession) return // superseded or cancelled
    if (i >= chunks.length) {
      onEnd?.()
      return
    }
    const u = new SpeechSynthesisUtterance(chunks[i++])
    if (v) u.voice = v
    u.lang = v?.lang || lang
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
