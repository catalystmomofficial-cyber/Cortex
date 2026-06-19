import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles, Trash2, ArrowUpRight, Mic, AudioLines } from 'lucide-react'
import { useStore } from '../store'
import { streamChat } from '../lib/gemini'
import { buildSystemPrompt } from '../lib/prompt'
import { useDictation } from '../hooks/useDictation'
import './Advisor.css'

const SUGGESTIONS = [
  'What should I focus on this week?',
  'Which goal is most at risk, and why?',
  'Am I working on the right things?',
  'Turn my latest ideas into a plan.',
]

// Tiny **bold** renderer so advisor replies read cleanly.
function renderText(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p
  )
}

export default function Advisor({ onVoice }) {
  const { state, dispatch } = useStore()
  const messages = state.advisor.messages

  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const threadRef = useRef(null)
  const abortRef = useRef(null)

  // Dictation: transcribes speech into the text box (stays for editing/sending).
  const dictateBaseRef = useRef('')
  const dictation = useDictation(
    (text) => {
      setInput((dictateBaseRef.current ? dictateBaseRef.current + ' ' : '') + text)
    },
    state.settings.language || 'en-US'
  )

  function toggleDictation() {
    if (dictation.listening) {
      dictation.stop()
    } else {
      dictateBaseRef.current = input.trim()
      dictation.start()
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const el = threadRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  async function send(rawText) {
    const content = (rawText ?? input).trim()
    if (!content || busy) return
    setError('')
    if (dictation.listening) dictation.stop()

    const next = [...messages, { role: 'user', content }]
    dispatch({ type: 'SET_ADVISOR_MESSAGES', messages: next })
    setInput('')
    setBusy(true)
    setStreaming('')
    scrollToBottom()

    const controller = new AbortController()
    abortRef.current = controller

    let acc = ''
    try {
      await streamChat({
        model: state.settings.geminiModel,
        system: buildSystemPrompt(state),
        messages: next,
        signal: controller.signal,
        onDelta: (d) => {
          acc += d
          setStreaming(acc)
          scrollToBottom()
        },
      })
      dispatch({ type: 'SET_ADVISOR_MESSAGES', messages: [...next, { role: 'assistant', content: acc }] })
    } catch (e) {
      if (e.name === 'AbortError') {
        if (acc) dispatch({ type: 'SET_ADVISOR_MESSAGES', messages: [...next, { role: 'assistant', content: acc }] })
      } else {
        setError(
          e.message === 'NO_SERVER_KEY'
            ? "AI isn't connected yet. Please try again shortly."
            : 'Something went wrong. Please try again.'
        )
        dispatch({ type: 'SET_ADVISOR_MESSAGES', messages })
      }
    } finally {
      setBusy(false)
      setStreaming('')
      abortRef.current = null
      scrollToBottom()
    }
  }

  useEffect(() => () => abortRef.current?.abort(), [])

  const empty = messages.length === 0 && !busy

  return (
    <div className="advisor">
      <div className="advisor-head">
        <div className="row between">
          <div>
            <div className="eyebrow">Advisor</div>
            <h1 style={{ fontSize: 24 }}>Your Business Advisor</h1>
          </div>
          {messages.length > 0 && (
            <button
              className="btn-icon"
              aria-label="Clear conversation"
              onClick={() => dispatch({ type: 'CLEAR_ADVISOR' })}
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="advisor-thread" ref={threadRef}>
        {empty ? (
          <div className="advisor-intro">
            <div className="advisor-orb">
              <Sparkles size={28} />
            </div>
            <strong style={{ fontSize: 18 }}>Ask anything about your business.</strong>
            <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>
              I know your goals, ideas, and what you're building.
            </p>
            <div className="suggest-grid">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="suggest" onClick={() => send(s)}>
                  <span>{s}</span>
                  <ArrowUpRight size={16} color="var(--amber)" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.role === 'assistant' ? renderText(m.content) : m.content}
              </div>
            ))}
            {busy && (
              <div className="bubble assistant">
                {streaming ? (
                  renderText(streaming)
                ) : (
                  <span className="typing">
                    <span /> <span /> <span />
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {error && (
          <div className="bubble assistant" style={{ borderColor: 'rgba(224,122,114,0.3)', color: 'var(--red)' }}>
            {error}
          </div>
        )}
      </div>

      <div className="composer">
        <div className="composer-inner">
          {dictation.supported && (
            <button
              className={`composer-icon-btn ${dictation.listening ? 'active' : ''}`}
              onClick={toggleDictation}
              aria-label={dictation.listening ? 'Stop dictation' : 'Dictate'}
            >
              <Mic size={19} />
            </button>
          )}
          <textarea
            rows={1}
            placeholder="Ask your advisor…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onInput={(e) => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          {input.trim() ? (
            <button className="composer-send" disabled={busy} onClick={() => send()} aria-label="Send">
              <Send size={18} />
            </button>
          ) : (
            onVoice && (
              <button className="composer-voice" onClick={onVoice} aria-label="Voice mode">
                <AudioLines size={19} />
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
