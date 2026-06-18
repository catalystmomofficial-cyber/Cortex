import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { usePCMAudioRecorderContext } from '@speechmatics/browser-audio-input-react'
import { useSpeechmatics } from '../hooks/useSpeechmatics'
import { useStore } from '../store'
import { buildSystemPrompt } from '../lib/prompt'
import { streamChat } from '../lib/gemini'
import { speak, cancelSpeech } from '../lib/speech'
import VoiceOrb from './VoiceOrb'
import './VoiceOverlay.css'

const SUGGESTIONS = [
  'What should I focus on today?',
  'My finance goal is at risk',
  'Add a new growth goal',
  "What's my biggest challenge?",
]

// Conversational voice advisor — listen, think, speak — with the gold orb
// reacting throughout (like ChatGPT / Gemini voice mode).
export default function VoiceOverlay({ onClose }) {
  const { state } = useStore()
  const org = (state.profile.company || '').trim() || 'Cortex'
  const recorder = usePCMAudioRecorderContext()
  const sm = useSpeechmatics()

  const [mode, setMode] = useState('idle') // idle | listening | thinking | speaking
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')

  const levelRef = useRef(0)
  const modeRef = useRef('idle')
  const speakBumpRef = useRef(0)
  const transcriptRef = useRef('')
  const historyRef = useRef([])
  const abortRef = useRef(null)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  useEffect(() => {
    transcriptRef.current = sm.transcript
  }, [sm.transcript])

  // Tear everything down on close.
  useEffect(() => {
    return () => {
      sm.stop()
      cancelSpeech()
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Drive the orb's energy from the mic (listening) or a synthetic pulse
  // (thinking / speaking), so it visibly moves while responding.
  useEffect(() => {
    let raf
    let t = 0
    const buf = new Uint8Array(2048)
    function loop() {
      t += 0.016
      const m = modeRef.current
      let lvl = 0.12 + 0.04 * Math.sin(t * 2)
      if (m === 'listening') {
        const a = recorder.analyser
        if (a) {
          a.getByteTimeDomainData(buf)
          let s = 0
          for (let i = 0; i < a.fftSize; i++) {
            const x = (buf[i] - 128) / 128
            s += x * x
          }
          lvl = Math.min(1, Math.sqrt(s / a.fftSize) * 3.4)
        }
      } else if (m === 'thinking') {
        lvl = 0.3 + 0.12 * Math.sin(t * 3)
      } else if (m === 'speaking') {
        speakBumpRef.current *= 0.9
        lvl = Math.min(1, 0.42 + 0.22 * Math.sin(t * 5) + speakBumpRef.current)
      }
      levelRef.current = lvl
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [recorder])

  function startListening() {
    cancelSpeech()
    sm.reset()
    sm.start()
    setMode('listening')
  }

  async function ask(text) {
    const content = (text || '').trim()
    if (!content) return
    setError('')
    cancelSpeech()
    sm.stop()

    const msgs = [...historyRef.current, { role: 'user', content }]
    historyRef.current = msgs
    setAnswer('')
    setMode('thinking')

    const controller = new AbortController()
    abortRef.current = controller
    let acc = ''
    try {
      await streamChat({
        system: buildSystemPrompt(state),
        messages: msgs,
        signal: controller.signal,
        onDelta: (d) => {
          acc += d
          setAnswer(acc)
        },
      })
      historyRef.current = [...msgs, { role: 'assistant', content: acc }]
      setMode('speaking')
      speak(acc, {
        onBoundary: () => {
          speakBumpRef.current = Math.min(0.5, speakBumpRef.current + 0.18)
        },
        onEnd: () => {
          // AI finished talking → return to rest; suggestions slide back in.
          if (modeRef.current === 'speaking') setMode('idle')
        },
      })
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError(
          e.message === 'NO_SERVER_KEY'
            ? "AI isn't connected yet. Please try again shortly."
            : 'Something went wrong. Tap the orb to try again.'
        )
      }
      setMode('idle')
    }
  }

  function onOrbTap() {
    const m = modeRef.current
    if (m === 'thinking') return
    if (m === 'speaking') {
      // Interrupt the advisor and start listening again.
      cancelSpeech()
      startListening()
      return
    }
    if (m === 'listening') {
      const txt = transcriptRef.current
      if (txt.trim()) ask(txt)
      else {
        sm.stop()
        setMode('idle')
      }
      return
    }
    startListening() // idle → begin talking
  }

  const label =
    sm.status === 'connecting' && mode === 'listening'
      ? 'Connecting…'
      : mode === 'listening'
        ? 'Listening…'
        : mode === 'thinking'
          ? 'Thinking…'
          : mode === 'speaking'
            ? 'Speaking…'
            : 'Tap to speak'

  const inConversation = mode === 'thinking' || mode === 'speaking'
  const showPrompts = mode === 'idle' // suggestions only at rest

  return (
    <div className="voice-overlay">
      <div className="voice-top">
        <div>
          <div className="title">Voice Mode</div>
          <div className="org">
            <span className="dot" /> {org}
          </div>
        </div>
        <button className="voice-close" aria-label="Close" onClick={onClose}>
          <X size={22} />
        </button>
      </div>

      <div className="voice-center">
        <div className="voice-state">{label}</div>

        <div className={`orb-stage ${mode === 'listening' || mode === 'speaking' ? 'listening' : ''}`}>
          <span className="orb-ring r1" />
          <span className="orb-ring r2" />
          <span className="orb-ring r3" />
          <button onClick={onOrbTap} aria-label="Voice control" style={{ background: 'none', display: 'flex' }}>
            <VoiceOrb levelRef={levelRef} size={260} />
          </button>
        </div>

        <div className="voice-stage-text">
          {inConversation ? (
            <div className="voice-answer">{answer || '…'}</div>
          ) : mode === 'listening' && sm.transcript ? (
            <div className="voice-transcript">
              {sm.finalText && <span>{sm.finalText} </span>}
              {sm.partialText && <span className="partial">{sm.partialText}</span>}
            </div>
          ) : null}
        </div>

        {error && <div className="voice-error">{error}</div>}
      </div>

      <div className={`voice-suggestions ${showPrompts ? '' : 'hidden'}`}>
        <div className="voice-trylabel">Try saying</div>
        {SUGGESTIONS.map((s) => (
          <button key={s} className="gold-pill" onClick={() => ask(s)} tabIndex={showPrompts ? 0 : -1}>
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
