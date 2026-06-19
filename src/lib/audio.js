// A single shared AudioContext for the whole app. We create it with the
// device's native sample rate (forcing a rate breaks iOS) and resume it from a
// user gesture — browsers start it "suspended" until then, and if it isn't
// truly running the mic graph produces no audio.
export const sharedAudioContext =
  typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
    ? new (window.AudioContext || window.webkitAudioContext)()
    : undefined

export function resumeAudio() {
  try {
    if (sharedAudioContext && sharedAudioContext.state !== 'running') {
      return sharedAudioContext.resume()
    }
  } catch {
    /* noop */
  }
  return Promise.resolve()
}

export function audioState() {
  return sharedAudioContext?.state || 'none'
}

export function audioSampleRate() {
  return sharedAudioContext?.sampleRate || 16000
}
