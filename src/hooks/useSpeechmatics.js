import { useCallback, useEffect, useRef, useState } from 'react'
import { RealtimeClient } from '@speechmatics/real-time-client'
import { sharedAudioContext, resumeAudio, audioSampleRate } from '../lib/audio'

const FALLBACK_SAMPLE_RATE = 16000
const TOKEN_ENDPOINT = '/api/speechmatics-token'

/**
 * Real-time speech-to-text via Speechmatics, capturing the mic ourselves with
 * getUserMedia + a ScriptProcessor (works reliably across browsers, including
 * iOS, unlike the SDK's AudioWorklet path). Exposes a live `levelRef` (0..1)
 * for the orb and `framesRef` for diagnostics.
 */
export function useSpeechmatics() {
  const [status, setStatus] = useState('idle') // idle | connecting | listening | stopping | error
  const [finalText, setFinalText] = useState('')
  const [partialText, setPartialText] = useState('')
  const [error, setError] = useState('')
  const [socketState, setSocketState] = useState('')

  const clientRef = useRef(null)
  const readyRef = useRef(false) // true only after RecognitionStarted
  const finalRef = useRef('')
  const framesRef = useRef(0)
  const levelRef = useRef(0)

  const streamRef = useRef(null)
  const sourceRef = useRef(null)
  const procRef = useRef(null)

  const cleanup = useCallback(() => {
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
    readyRef.current = false
    const client = clientRef.current
    if (client) {
      client.stopRecognition({ noTimeout: true }).catch(() => {})
      clientRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    setStatus('stopping')
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

  const start = useCallback(async () => {
    setError('')
    setStatus('connecting')
    finalRef.current = ''
    setFinalText('')
    setPartialText('')
    framesRef.current = 0
    readyRef.current = false

    const ctx = sharedAudioContext
    if (!ctx) {
      setError('Audio is not supported on this device.')
      setStatus('error')
      return
    }

    // 1) Capture the mic ourselves so the orb reacts immediately and audio is
    //    guaranteed to flow, independent of the transcription connection.
    try {
      await resumeAudio()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream
      const source = ctx.createMediaStreamSource(stream)
      sourceRef.current = source
      const proc = ctx.createScriptProcessor(4096, 1, 1)
      procRef.current = proc
      proc.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0)
        framesRef.current += 1
        // Mic level (RMS) for the orb.
        let s = 0
        for (let i = 0; i < input.length; i++) s += input[i] * input[i]
        levelRef.current = Math.min(1, Math.sqrt(s / input.length) * 4)
        // Forward PCM to Speechmatics once the session is ready (copy — buffer
        // is reused). Sending before RecognitionStarted closes the connection.
        const client = clientRef.current
        if (client && readyRef.current && client.socketState === 'open') {
          client.sendAudio(new Float32Array(input).buffer)
        }
      }
      source.connect(proc)
      proc.connect(ctx.destination)
    } catch (e) {
      setError('Microphone could not start: ' + (e?.message || e))
      setStatus('error')
      cleanup()
      return
    }
    setStatus('listening')

    // 2) Get a transcription token.
    let token
    try {
      const res = await fetch(TOKEN_ENDPOINT)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Token endpoint returned ${res.status}`)
      }
      token = (await res.json()).token
      if (!token) throw new Error('No token returned from server.')
    } catch (e) {
      setError('Could not reach the voice service (token).')
      return // mic stays on; orb still reacts
    }

    // 3) Connect Speechmatics.
    const client = new RealtimeClient()
    clientRef.current = client
    client.addEventListener('socketStateChange', () => setSocketState(client.socketState || ''))
    client.addEventListener('receiveMessage', ({ data }) => {
      switch (data.message) {
        case 'AddPartialTranscript':
          setPartialText(data.metadata?.transcript || '')
          break
        case 'AddTranscript': {
          const seg = data.metadata?.transcript || ''
          if (seg) {
            finalRef.current = (finalRef.current + seg).replace(/\s+/g, ' ')
            setFinalText(finalRef.current.trim())
          }
          setPartialText('')
          break
        }
        case 'Error':
          setError(data.reason || 'Transcription error')
          break
        default:
          break
      }
    })

    const sampleRate = Math.round(audioSampleRate() || FALLBACK_SAMPLE_RATE)
    try {
      await client.start(token, {
        audio_format: { type: 'raw', encoding: 'pcm_f32le', sample_rate: sampleRate },
        transcription_config: {
          language: 'en',
          enable_partials: true,
          operating_point: 'standard',
          max_delay: 1.5,
        },
      })
      // Session acknowledged — now it's safe to stream audio.
      readyRef.current = true
    } catch (e) {
      setError('Transcription could not start: ' + (e?.message || e))
    }
  }, [cleanup])

  useEffect(() => () => cleanup(), [cleanup])

  const transcript = [finalText, partialText].filter(Boolean).join(' ').trim()

  return {
    status,
    isListening: status === 'listening',
    transcript,
    finalText,
    partialText,
    error,
    socketState,
    framesRef,
    levelRef,
    start,
    stop,
    reset,
  }
}
