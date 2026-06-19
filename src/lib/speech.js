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

// Prefer a natural-sounding English voice when available.
function pickVoice() {
  const voices = voicesCache.length ? voicesCache : loadVoices()
  const preferred = [
    'Google UK English Female',
    'Google US English',
    'Samantha',
    'Microsoft Aria Online (Natural) - English (United States)',
  ]
  for (const name of preferred) {
    const v = voices.find((x) => x.name === name)
    if (v) return v
  }
  return voices.find((v) => /en[-_]/i.test(v.lang)) || voices[0] || null
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
export function speak(text, { onStart, onBoundary, onEnd } = {}) {
  if (!isSpeechSupported() || !text) {
    onEnd?.()
    return
  }
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const v = pickVoice()
  if (v) u.voice = v
  u.rate = 1.02
  u.pitch = 1.0
  u.onstart = () => onStart?.()
  u.onboundary = () => onBoundary?.()
  u.onend = () => onEnd?.()
  u.onerror = () => onEnd?.()
  speechSynthesis.speak(u)
}
