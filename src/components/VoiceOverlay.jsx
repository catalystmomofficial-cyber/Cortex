import { useEffect } from 'react'
import { X, Mic, Square, MessageSquare, Lightbulb, RotateCcw } from 'lucide-react'
import { useSpeechmatics } from '../hooks/useSpeechmatics'
import './VoiceOverlay.css'

const TRY_SAYING = [
  'My finance goal is at risk',
  'Add a goal: 50 new customers',
  'What should I focus on today?',
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
  const connecting = status === 'connecting'

  function toggleMic() {
    if (isListening) stop()
    else start()
  }

  function sendTo(destination) {
    stop()
    onComplete(finalText || transcript, destination)
  }

  return (
    <div className="voice-overlay">
      <div className="voice-top">
        <span className="voice-title">Voice Mode</span>
        <button className="btn-icon" aria-label="Close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="voice-center">
        <div className="orb-wrap">
          <button
            className={`orb ${isListening ? 'listening' : 'idle'}`}
            onClick={toggleMic}
            aria-label={isListening ? 'Stop listening' : 'Start listening'}
          >
            <span className="orb-ring r1" />
            <span className="orb-ring r2" />
            <span className="orb-ring r3" />
            {isListening ? <Square size={34} fill="#2a1700" /> : <Mic size={40} strokeWidth={2.2} />}
          </button>
        </div>

        <div className="voice-hint">
          {connecting
            ? 'Connecting…'
            : isListening
              ? 'Listening… tap the orb to stop'
              : hasText
                ? 'Tap the orb to record again'
                : 'Tap the orb to speak'}
        </div>

        <div className={`voice-transcript ${hasText ? '' : 'empty'}`}>
          {hasText ? (
            <>
              {finalText && <span>{finalText} </span>}
              {partialText && <span className="partial">{partialText}</span>}
            </>
          ) : (
            'Your words will appear here.'
          )}
        </div>

        {error && <div className="voice-error">{error}</div>}

        {!hasText && !error && !isListening && (
          <div className="voice-suggestions">
            <div className="faint" style={{ width: '100%', textAlign: 'center', fontSize: 12 }}>
              Try saying
            </div>
            {TRY_SAYING.map((s) => (
              <span className="chip" key={s}>
                “{s}”
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="voice-actions">
        {hasText && (
          <>
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
          </>
        )}
      </div>
    </div>
  )
}
