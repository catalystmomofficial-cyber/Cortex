import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles, Trash2, Settings as SettingsIcon, ArrowUpRight, Mic } from 'lucide-react'
import { useStore } from '../store'
import { streamChat } from '../lib/gemini'
import './Advisor.css'

const SUGGESTIONS = [
  'What should I focus on this week?',
  'Which goal is most at risk, and why?',
  'Am I working on the right things?',
  'Turn my latest ideas into a plan.',
]

function buildSystemPrompt(state) {
  const { profile, goals, ideas } = state
  const lines = [
    'You are Cortex, the user\'s sharp, private business advisor. You speak like an experienced operator and co-founder, not a corporate consultant.',
    'Be direct, concise, and practical. Prefer short paragraphs and tight bullet points. Always end with a concrete next action when relevant.',
    'You have full context on their business below. Reference their actual goals and ideas. Never invent facts you were not given.',
    '',
    '## Business context',
  ]
  lines.push(`Business / what they do: ${profile.business || 'not provided'}`)
  lines.push(`Customer: ${profile.customer || 'not provided'}`)
  lines.push(`Offer: ${profile.offer || 'not provided'}`)
  lines.push(`90-day win: ${profile.win90 || 'not provided'}`)

  if (goals.length) {
    lines.push('', '## Current goals')
    const labels = { on: 'On Track', risk: 'At Risk', off: 'Off Track', overdue: 'Overdue' }
    for (const g of goals) {
      lines.push(
        `- ${g.title} [${labels[g.status] || g.status}]${g.win ? ` — win: ${g.win}` : ''}${g.due ? ` — due ${g.due}` : ''}`
      )
    }
  }
  if (ideas.length) {
    lines.push('', '## Recent captured ideas')
    for (const i of ideas.slice(0, 12)) lines.push(`- ${i.text}`)
  }
  return lines.join('\n')
}

// Tiny **bold** renderer so advisor replies read cleanly.
function renderText(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p
  )
}

export default function Advisor({ handoff, onHandoffConsumed, onNavigate, onVoice }) {
  const { state, dispatch } = useStore()
  const messages = state.advisor.messages
  const hasKey = !!state.settings.geminiKey

  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const threadRef = useRef(null)
  const abortRef = useRef(null)
  const handledHandoff = useRef(0)

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

    if (!hasKey) {
      setError('NO_KEY')
      return
    }

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
        apiKey: state.settings.geminiKey,
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
      } else if (e.message === 'NO_KEY' || e.message === 'BAD_KEY') {
        setError('BAD_KEY')
        dispatch({ type: 'SET_ADVISOR_MESSAGES', messages })
      } else if (e.message === 'RATE_LIMIT') {
        setError('Rate limit reached on the free tier. Wait a moment and try again.')
        dispatch({ type: 'SET_ADVISOR_MESSAGES', messages })
      } else {
        setError(e.message || 'Something went wrong talking to Gemini.')
        dispatch({ type: 'SET_ADVISOR_MESSAGES', messages })
      }
    } finally {
      setBusy(false)
      setStreaming('')
      abortRef.current = null
      scrollToBottom()
    }
  }

  // Auto-send text dictated from Voice Mode.
  useEffect(() => {
    if (handoff?.text && handoff.at !== handledHandoff.current) {
      handledHandoff.current = handoff.at
      onHandoffConsumed?.()
      send(handoff.text)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff])

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
          <div className="row">
            {messages.length > 0 && (
              <button
                className="btn-icon"
                aria-label="Clear conversation"
                onClick={() => dispatch({ type: 'CLEAR_ADVISOR' })}
              >
                <Trash2 size={18} />
              </button>
            )}
            <button className="btn-icon" aria-label="Settings" onClick={() => onNavigate('settings')}>
              <SettingsIcon size={18} />
            </button>
          </div>
        </div>
      </div>

      {!hasKey && (
        <div className="key-banner">
          <strong>Connect your AI.</strong> Add a free Google Gemini API key in Settings to activate
          your advisor.
          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 10 }}
            onClick={() => onNavigate('settings')}
          >
            Add Gemini key <ArrowUpRight size={15} />
          </button>
        </div>
      )}

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

        {error && error !== 'NO_KEY' && error !== 'BAD_KEY' && (
          <div className="bubble assistant" style={{ borderColor: 'rgba(248,113,113,0.3)', color: 'var(--red)' }}>
            {error}
          </div>
        )}
        {(error === 'NO_KEY' || error === 'BAD_KEY') && (
          <div className="bubble assistant" style={{ borderColor: 'rgba(245,166,35,0.3)' }}>
            {error === 'NO_KEY'
              ? 'Add your Gemini API key in Settings first.'
              : 'That Gemini API key was rejected. Check it in Settings.'}
          </div>
        )}
      </div>

      <div className="composer">
        <div className="composer-inner">
          {onVoice && (
            <button className="composer-mic" onClick={onVoice} aria-label="Voice mode">
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
          <button className="composer-send" disabled={busy || !input.trim()} onClick={() => send()} aria-label="Send">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
