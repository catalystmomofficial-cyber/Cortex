import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles, Trash2, ArrowUpRight, Mic, AudioLines, Wand2, X, Pencil, Copy } from 'lucide-react'
import { useStore } from '../store'
import { streamChat } from '../lib/gemini'
import { buildSystemPrompt } from '../lib/prompt'
import { useDictation } from '../hooks/useDictation'
import { usePlanOrganizer } from '../hooks/usePlanOrganizer'
import PlanReview from '../components/PlanReview'
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

export default function Advisor({ onVoice, onNavigate }) {
  const { state, dispatch } = useStore()
  const messages = state.advisor.messages

  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const { organize, organizing, plan, setPlan, planError, applyPlan } = usePlanOrganizer()

  // Collapsible organize control + long-press message menu.
  const [orgOpen, setOrgOpen] = useState(true)
  const [menuMsg, setMenuMsg] = useState(null) // { index, message }
  const [copied, setCopied] = useState(false)
  const pressTimer = useRef(null)

  const lastUserIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return i
    return -1
  })()

  function startPress(index) {
    clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => setMenuMsg({ index, message: messages[index] }), 450)
  }
  function cancelPress() {
    clearTimeout(pressTimer.current)
  }

  function copyMessage(text) {
    try {
      navigator.clipboard?.writeText(text)
    } catch {
      /* noop */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
    setMenuMsg(null)
  }

  function editMessage(index) {
    // Edit the last user turn: pull it back into the composer and drop it (and
    // its reply) so the edited version starts a fresh turn.
    setInput(messages[index].content)
    dispatch({ type: 'SET_ADVISOR_MESSAGES', messages: messages.slice(0, index) })
    setMenuMsg(null)
  }

  const threadRef = useRef(null)
  const abortRef = useRef(null)

  // Dictation: transcribes speech into the text box (stays for editing/sending).
  const dictateBaseRef = useRef('')
  const dictation = useDictation((text) => {
    setInput((dictateBaseRef.current ? dictateBaseRef.current + ' ' : '') + text)
  }, state.settings.language || 'en-US')

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
              <div key={i} className={`bubble-wrap ${m.role}`}>
                {m.role === 'user' && m.via === 'voice' && <span className="bubble-tag">voice</span>}
                <div
                  className={`bubble ${m.role}`}
                  onTouchStart={() => startPress(i)}
                  onTouchEnd={cancelPress}
                  onTouchMove={cancelPress}
                  onMouseDown={() => startPress(i)}
                  onMouseUp={cancelPress}
                  onMouseLeave={cancelPress}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenuMsg({ index: i, message: m })
                  }}
                >
                  {m.role === 'assistant' ? renderText(m.content) : m.content}
                </div>
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
        {planError && (
          <div className="bubble assistant" style={{ borderColor: 'rgba(216,180,106,0.3)' }}>
            {planError}
          </div>
        )}
      </div>

      {messages.length > 0 && orgOpen && (
        <div className="organize-bar">
          <button className="organize-btn" onClick={organize} disabled={organizing}>
            <Wand2 size={16} />
            {organizing ? 'Organizing…' : 'Organize into my plan'}
          </button>
          <button className="organize-x" aria-label="Collapse" onClick={() => setOrgOpen(false)}>
            <X size={15} />
          </button>
        </div>
      )}

      {copied && <div className="toast">Copied</div>}

      {menuMsg && (
        <div className="sheet-backdrop" onClick={() => setMenuMsg(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {menuMsg.message.role === 'user' && menuMsg.index === lastUserIndex && (
              <button className="menu-row" onClick={() => editMessage(menuMsg.index)}>
                <Pencil size={17} /> Edit
              </button>
            )}
            <button className="menu-row" onClick={() => copyMessage(menuMsg.message.content)}>
              <Copy size={17} /> Copy text
            </button>
            <button className="menu-row cancel" onClick={() => setMenuMsg(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {plan && (
        <PlanReview
          plan={plan}
          onClose={() => setPlan(null)}
          onApply={(sel) => applyPlan(sel, () => onNavigate?.('pulse'))}
        />
      )}

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
          {messages.length > 0 && !orgOpen && (
            <button
              className="composer-icon-btn organize-mini"
              onClick={() => setOrgOpen(true)}
              aria-label="Organize into my plan"
            >
              <Wand2 size={19} />
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
