import { useCallback, useEffect, useRef, useState } from 'react'
import { RealtimeClient } from '@speechmatics/real-time-client'
import {
  usePCMAudioRecorderContext,
  usePCMAudioListener,
} from '@speechmatics/browser-audio-input-react'

const SAMPLE_RATE = 16000
const TOKEN_ENDPOINT = '/api/speechmatics-token'

/**
 * Real-time speech-to-text via Speechmatics.
 *
 * Must be used inside <PCMAudioRecorderProvider>. Returns live transcript text
 * (finalised segments + the in-progress partial) plus start/stop controls.
 */
export function useSpeechmatics() {
  const recorder = usePCMAudioRecorderContext()
  const clientRef = useRef(null)
  const finalRef = useRef('')

  const [status, setStatus] = useState('idle') // idle | connecting | listening | stopping | error
  const [finalText, setFinalText] = useState('')
  const [partialText, setPartialText] = useState('')
  const [error, setError] = useState('')

  // Forward captured PCM frames to Speechmatics while listening.
  usePCMAudioListener(
    useCallback((audio) => {
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
      setError(
        'Could not reach the voice token service. Make sure SPEECHMATICS_API_KEY is set and you are running with serverless functions (vercel dev / deployed).'
      )
      setStatus('error')
      return
    }

    const client = new RealtimeClient()
    clientRef.current = client

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
          setError(data.reason || 'Speechmatics error')
          setStatus('error')
          cleanup()
          break
        default:
          break
      }
    })

    try {
      await client.start(token, {
        audio_format: { type: 'raw', encoding: 'pcm_f32le', sample_rate: SAMPLE_RATE },
        transcription_config: {
          language: 'en',
          enable_partials: true,
          operating_point: 'enhanced',
          max_delay: 1.2,
        },
      })

      await recorder.startRecording({})
      setStatus('listening')
    } catch (e) {
      setError(e?.message || 'Failed to start microphone or transcription.')
      setStatus('error')
      cleanup()
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
    start,
    stop,
    reset,
  }
}

export const VOICE_SAMPLE_RATE = SAMPLE_RATE
