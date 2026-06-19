import { useCallback, useEffect, useRef, useState } from 'react'
import { sharedAudioContext, resumeAudio } from '../lib/audio'

// Free, no-key, no-quota speech recognition using the browser's built-in
// Web Speech API. We also run our own mic capture purely to drive the orb's
// live level (the Web Speech API doesn't expose audio levels).
export function useVoiceRecognition() {
  const [status, setStatus] = useState('idle') // idle | listening | error
  const [finalText, setFinalText] = useState('')
  const [partialText, setPartialText] = useState('')
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)

  const recRef = useRef(null)
  const listeningRef = useRef(false)
  const mutedRef = useRef(false)
  const finalRef = useRef('')
  const framesRef = useRef(0)
  const levelRef = useRef(0)

  const streamRef = useRef(null)
  const sourceRef = useRef(null)
  const procRef = useRef(null)

  const supported =
    typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)

  const stopLevel = useCallback(() => {
    try {
      if (procRef.current) procRef.current.onaudioprocess = null
      procRef.current?.disconnect()
    } catch {
      /* noop */
    }
    try {
      sourceRef.current?.disconnect()
    } catch {
      /* noop */
    }
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    } catch {
      /* noop */
    }
    procRef.current = null
    sourceRef.current = null
    streamRef.current = null
    levelRef.current = 0
  }, [])

  const cleanup = useCallback(() => {
    listeningRef.current = false
    const r = recRef.current
    if (r) {
      r.onend = null
      r.onresult = null
      r.onerror = null
      try {
        r.abort()
      } catch {
        /* noop */
      }
      recRef.current = null
    }
    stopLevel()
  }, [stopLevel])

  const stop = useCallback(() => {
    cleanup()
    setPartialText('')
    setStatus('idle')
  }, [cleanup])

  const reset = useCallback(() => {
    finalRef.current = ''
    setFinalText('')
    setPartialText('')
    setError('')
  }, [])

  async function startLevel() {
    const ctx = sharedAudioContext
    if (!ctx) return
    try {
      await resumeAudio()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream
      const source = ctx.createMediaStreamSource(stream)
      sourceRef.current = source
      const proc = ctx.createScriptProcessor(2048, 1, 1)
      procRef.current = proc
      proc.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0)
        framesRef.current += 1
        if (mutedRef.current) {
          levelRef.current = 0
          return
        }
        let s = 0
        for (let i = 0; i < input.length; i++) s += input[i] * input[i]
        levelRef.current = Math.min(1, Math.sqrt(s / input.length) * 4)
      }
      source.connect(proc)
      proc.connect(ctx.destination)
    } catch {
      /* level is best-effort; recognition can still work */
    }
  }

  const start = useCallback(async () => {
    setError('')
    finalRef.current = ''
    setFinalText('')
    setPartialText('')
    framesRef.current = 0

    if (!supported) {
      setError('Voice input is not supported in this browser. Try Chrome or Safari.')
      setStatus('error')
      return
    }

    await startLevel()

    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition
    const r = new Rec()
    r.continuous = true
    r.interimResults = true
    r.lang = 'en-US'

    r.onresult = (e) => {
      let interim = ''
      let finalAdd = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finalAdd += res[0].transcript
        else interim += res[0].transcript
      }
      if (finalAdd) {
        finalRef.current = `${finalRef.current} ${finalAdd}`.replace(/\s+/g, ' ').trim()
        setFinalText(finalRef.current)
      }
      setPartialText(interim)
    }

    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('Microphone permission was denied.')
      } else {
        setError('Voice error: ' + e.error)
      }
    }

    r.onend = () => {
      // Web Speech stops on its own; keep it going while we're listening.
      if (listeningRef.current && !mutedRef.current) {
        try {
          r.start()
        } catch {
          /* already started */
        }
      }
    }

    recRef.current = r
    listeningRef.current = true
    try {
      r.start()
      setStatus('listening')
    } catch (e) {
      setError('Could not start voice: ' + (e?.message || e))
      setStatus('error')
    }
  }, [supported])

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current
    mutedRef.current = next
    setMuted(next)
    const r = recRef.current
    if (next) {
      // Muted: stop recognising (so the advisor's voice isn't picked up).
      try {
        r?.abort()
      } catch {
        /* noop */
      }
      levelRef.current = 0
    } else if (listeningRef.current && r) {
      try {
        r.start()
      } catch {
        /* noop */
      }
    }
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const transcript = [finalText, partialText].filter(Boolean).join(' ').trim()

  return {
    status,
    isListening: status === 'listening',
    transcript,
    finalText,
    partialText,
    error,
    muted,
    toggleMute,
    supported: !!supported,
    framesRef,
    levelRef,
    start,
    stop,
    reset,
  }
}
