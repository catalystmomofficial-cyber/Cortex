import { useEffect } from 'react'
import { X, MessageSquare, Lightbulb, RotateCcw } from 'lucide-react'
import { useSpeechmatics } from '../hooks/useSpeechmatics'
import VoiceOrb from './VoiceOrb'
import './VoiceOverlay.css'

const ORG = 'CATALYST MDM'

const SUGGESTIONS = [
  'What should I focus on today?',
  'My finance goal is at risk',
  'Add a new growth goal',
  "What's my biggest challenge?",
]

export default function VoiceOverlay({ onClose, onComplete }) {
  const { status, isListening, transcript, finalText, partialText, error, start, stop, reset } =
    useSpeechmatics()

  // Auto-start listening when the overlay opens.
  useEffect(() => {
    start()
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasText = transcript.trim().length > 0

  const stateLabel =
    status === 'connecting'
      ? 'Connecting…'
      : isListening
        ? 'Listening…'
        : hasText
          ? 'Tap orb to redo'
          : 'Tap to speak'

  function sendTo(destination) {
    stop()
    onComplete(finalText || transcript, destination)
  }

  return (
    <div className="voice-overlay">
      <div className="voice-top">
        <div>
          <div className="title">Voice Mode</div>
          <div className="org">
            <span className="dot" /> {ORG}
          </div>
        </div>
        <button className="voice-close" aria-label="Close" onClick={onClose}>
          <X size={22} />
        </button>
      </div>

      <div className="voice-center">
        <div className="voice-state">{stateLabel}</div>

        <div className={`orb-stage ${isListening ? 'listening' : ''}`}>
          <span className="orb-ring r1" />
          <span className="orb-ring r2" />
          <span className="orb-ring r3" />
          <button
            onClick={() => (isListening ? stop() : start())}
            aria-label={isListening ? 'Stop listening' : 'Start listening'}
            style={{ background: 'none', display: 'flex' }}
          >
            <VoiceOrb active={isListening} size={260} />
          </button>
        </div>

        {hasText ? (
          <div className="voice-transcript">
            {finalText && <span>{finalText} </span>}
            {partialText && <span className="partial">{partialText}</span>}
          </div>
        ) : (
          <div className="voice-trylabel">Try saying</div>
        )}

        {error && <div className="voice-error">{error}</div>}
      </div>

      {hasText ? (
        <div className="voice-actions">
          <div className="voice-dest-row">
            <button className="btn btn-ghost" onClick={() => sendTo('capture')}>
              <Lightbulb size={18} /> Save as Idea
            </button>
            <button className="btn btn-primary" onClick={() => sendTo('advisor')}>
              <MessageSquare size={18} /> Ask Advisor
            </button>
          </div>
          <button
            className="btn btn-ghost btn-block"
            onClick={() => {
              reset()
              start()
            }}
          >
            <RotateCcw size={16} /> Start over
          </button>
        </div>
      ) : (
        <>
          <div className="voice-suggestions">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="gold-pill"
                onClick={() => {
                  stop()
                  onComplete(s, 'advisor')
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="voice-footer">Powered by Speechmatics</div>
        </>
      )}
    </div>
  )
}
