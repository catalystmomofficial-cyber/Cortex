import { useCallback, useEffect, useRef, useState } from 'react'
import { RealtimeClient } from '@speechmatics/real-time-client'
import {
  usePCMAudioRecorderContext,
  usePCMAudioListener,
} from '@speechmatics/browser-audio-input-react'
import { resumeAudio, audioSampleRate } from '../lib/audio'

const FALLBACK_SAMPLE_RATE = 16000
const TOKEN_ENDPOINT = '/api/speechmatics-token'

/**
 * Real-time speech-to-text via Speechmatics.
 *
 * Must be used inside <PCMAudioRecorderProvider>. Returns live transcript text
 * (finalised segments + the in-progress partial) plus start/stop controls.
 */
export function useSpeechmatics(opts = {}) {
  const recorder = usePCMAudioRecorderContext()
  const clientRef = useRef(null)
  const finalRef = useRef('')

  // Keep the latest callback without re-subscribing the client.
  const onUtteranceEndRef = useRef(opts.onUtteranceEnd)
  onUtteranceEndRef.current = opts.onUtteranceEnd

  const [status, setStatus] = useState('idle') // idle | connecting | listening | stopping | error
  const [finalText, setFinalText] = useState('')
  const [partialText, setPartialText] = useState('')
  const [error, setError] = useState('')
  const [socketState, setSocketState] = useState('')

  // Diagnostic: counts mic frames captured (independent of the network), so we
  // can tell whether the recorder is actually producing audio.
  const framesRef = useRef(0)

  // Forward captured PCM frames to Speechmatics while listening.
  usePCMAudioListener(
    useCallback((audio) => {
      framesRef.current += 1
      const client = clientRef.current
      if (client && client.socketState === 'open') {
        client.sendAudio(audio.buffer)
      }
    }, [])
  )

  const cleanup = useCallback(() => {
    try {
      recorder.stopRecording()
    } catch {
      /* noop */
    }
    const client = clientRef.current
    if (client) {
      client.stopRecognition({ noTimeout: true }).catch(() => {})
      clientRef.current = null
    }
  }, [recorder])

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

    // 1) Start the microphone FIRST, so the orb reacts immediately and we know
    // capture works — independent of the transcription connection.
    try {
      await resumeAudio() // ensure the shared context is actually running
      await recorder.startRecording({})
    } catch (e) {
      setError('Microphone could not start: ' + (e?.message || e))
      setStatus('error')
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
      const data = await res.json()
      token = data.token
      if (!token) throw new Error('No token returned from server.')
    } catch (e) {
      setError('Could not reach the voice service (token).')
      return // mic stays on; orb still reacts
    }

    const client = new RealtimeClient()
    clientRef.current = client

    client.addEventListener('socketStateChange', () => {
      setSocketState(client.socketState || '')
    })

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
        case 'EndOfUtterance': {
          // The speaker paused long enough — hand the finished phrase upward.
          const text = finalRef.current.trim()
          if (text) onUtteranceEndRef.current?.(text)
          break
        }
        case 'Error':
          setError(data.reason || 'Speechmatics error')
          setStatus('error')
          cleanup()
          break
        default:
          break
      }
    })

    // Use the actual capture rate (iOS records at the hardware rate, e.g.
    // 48 kHz, regardless of any requested rate) so the declared rate matches.
    const sampleRate = Math.round(audioSampleRate() || FALLBACK_SAMPLE_RATE)

    try {
      await client.start(token, {
        audio_format: { type: 'raw', encoding: 'pcm_f32le', sample_rate: sampleRate },
        transcription_config: {
          language: 'en',
          enable_partials: true,
          // 'standard' is available on the free tier; 'enhanced' can be rejected.
          operating_point: 'standard',
          max_delay: 1.5,
        },
      })
      // Mic already running; transcription is now connected too.
    } catch (e) {
      setError('Transcription could not start: ' + (e?.message || e))
      // Leave the mic running so the orb still reacts to the voice.
    }
  }, [recorder, cleanup])

  useEffect(() => () => cleanup(), [cleanup])

  // Convenience: the complete transcript so far (final + live partial).
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
    start,
    stop,
    reset,
  }
}
