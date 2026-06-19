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

export function cancelSpeech() {
  if (isSpeechSupported()) speechSynthesis.cancel()
}

/**
 * Speak some text aloud.
 * @param {string} text
 * @param {object} [cb]
 * @param {()=>void} [cb.onStart]
 * @param {()=>void} [cb.onBoundary] - fires per word/sentence
 * @param {()=>void} [cb.onEnd]
 */
export function speak(text, { lang = 'en-US', onStart, onBoundary, onEnd } = {}) {
  if (!isSpeechSupported() || !text) {
    onEnd?.()
    return
  }
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const v = pickVoice(lang)
  if (v) u.voice = v
  u.lang = v?.lang || lang
  u.rate = 1.0
  u.pitch = 1.0
  u.onstart = () => onStart?.()
  u.onboundary = () => onBoundary?.()
  u.onend = () => onEnd?.()
  u.onerror = () => onEnd?.()
  speechSynthesis.speak(u)
}
