import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles, Trash2, ArrowUpRight, Mic, AudioLines, Wand2, X, Check } from 'lucide-react'
import { useStore, STATUS_META, DOMAINS } from '../store'
import { streamChat, generateJSON } from '../lib/gemini'
import { buildSystemPrompt, buildPlanExtractionPrompt } from '../lib/prompt'
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

export default function Advisor({ onVoice, onNavigate }) {
  const { state, dispatch } = useStore()
  const messages = state.advisor.messages

  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // "Organize into my plan" — extract structured items for confirmation.
  const [organizing, setOrganizing] = useState(false)
  const [plan, setPlan] = useState(null)
  const [planError, setPlanError] = useState('')

  const threadRef = useRef(null)
  const abortRef = useRef(null)

  async function organize() {
    if (organizing || !messages.length) return
    setPlanError('')
    setOrganizing(true)
    try {
      const transcript = messages
        .map((m) => `${m.role === 'assistant' ? 'Advisor' : 'You'}: ${m.content}`)
        .join('\n')
      const result = await generateJSON({
        system: buildPlanExtractionPrompt(),
        messages: [
          { role: 'user', content: `Conversation:\n${transcript}\n\nReturn the JSON plan.` },
        ],
      })
      const normalized = {
        goals: Array.isArray(result?.goals) ? result.goals.filter((g) => g && g.title) : [],
        focus: typeof result?.focus === 'string' ? result.focus.trim() : '',
        pulse: result?.pulse && (result.pulse.win || result.pulse.blocker || result.pulse.focus) ? result.pulse : null,
        ideas: Array.isArray(result?.ideas) ? result.ideas.filter((s) => typeof s === 'string' && s.trim()) : [],
      }
      if (!normalized.goals.length && !normalized.focus && !normalized.pulse && !normalized.ideas.length) {
        setPlanError('Nothing to organize yet — make some plans with the advisor first.')
      } else {
        setPlan(normalized)
      }
    } catch (e) {
      setPlanError(e.message === 'NO_SERVER_KEY' ? 'AI isn’t connected yet.' : 'Could not organize right now. Try again.')
    } finally {
      setOrganizing(false)
    }
  }

  function applyPlan(selected) {
    selected.goals.forEach((g) =>
      dispatch({
        type: 'ADD_GOAL',
        title: g.title,
        win: g.win || '',
        status: ['on', 'risk', 'off', 'overdue'].includes(g.status) ? g.status : 'on',
        due: g.due || '',
        domain: ['growth', 'finance', 'operations'].includes(g.domain) ? g.domain : 'growth',
      })
    )
    if (selected.focus) dispatch({ type: 'UPDATE_PROFILE', patch: { focus: selected.focus } })
    if (selected.pulse) dispatch({ type: 'ADD_PULSE', pulse: selected.pulse })
    selected.ideas.forEach((text) => dispatch({ type: 'ADD_IDEA', text }))
    setPlan(null)
    onNavigate?.('pulse')
  }

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
        {planError && (
          <div className="bubble assistant" style={{ borderColor: 'rgba(216,180,106,0.3)' }}>
            {planError}
          </div>
        )}
      </div>

      {messages.length > 0 && (
        <button className="organize-btn" onClick={organize} disabled={organizing}>
          <Wand2 size={16} />
          {organizing ? 'Organizing…' : 'Organize into my plan'}
        </button>
      )}

      {plan && <PlanReview plan={plan} onClose={() => setPlan(null)} onApply={applyPlan} />}

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

// Confirmation sheet: review what the advisor will file, toggle items, apply.
function PlanReview({ plan, onClose, onApply }) {
  const [goalsOn, setGoalsOn] = useState(plan.goals.map(() => true))
  const [ideasOn, setIdeasOn] = useState(plan.ideas.map(() => true))
  const [focusOn, setFocusOn] = useState(!!plan.focus)
  const [pulseOn, setPulseOn] = useState(!!plan.pulse)

  function apply() {
    onApply({
      goals: plan.goals.filter((_, i) => goalsOn[i]),
      ideas: plan.ideas.filter((_, i) => ideasOn[i]),
      focus: focusOn ? plan.focus : '',
      pulse: pulseOn ? plan.pulse : null,
    })
  }

  const domainLabel = (id) => DOMAINS.find((d) => d.id === id)?.label || 'Growth'
  const count =
    goalsOn.filter(Boolean).length +
    ideasOn.filter(Boolean).length +
    (focusOn && plan.focus ? 1 : 0) +
    (pulseOn && plan.pulse ? 1 : 0)

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 4 }}>
          <strong style={{ fontSize: 17 }}>Organize into my plan</strong>
          <button className="btn-icon" style={{ width: 36, height: 36 }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p className="faint" style={{ fontSize: 13, marginBottom: 14 }}>
          Review what I'll file. Untick anything you don't want.
        </p>

        {plan.focus && (
          <PlanRow checked={focusOn} onToggle={() => setFocusOn((v) => !v)} eyebrow="Today's One Thing" title={plan.focus} />
        )}

        {plan.goals.length > 0 && (
          <>
            <div className="plan-section">Goals</div>
            {plan.goals.map((g, i) => (
              <PlanRow
                key={i}
                checked={goalsOn[i]}
                onToggle={() => setGoalsOn((a) => a.map((v, j) => (j === i ? !v : v)))}
                eyebrow={`${domainLabel(g.domain)} · ${STATUS_META[g.status]?.label || 'On Track'}`}
                title={g.title}
                sub={g.win ? `Win: ${g.win}` : ''}
              />
            ))}
          </>
        )}

        {plan.pulse && (
          <>
            <div className="plan-section">Weekly Pulse</div>
            <PlanRow
              checked={pulseOn}
              onToggle={() => setPulseOn((v) => !v)}
              eyebrow="Check-in"
              title={[plan.pulse.win && `Win: ${plan.pulse.win}`, plan.pulse.blocker && `Blocker: ${plan.pulse.blocker}`, plan.pulse.focus && `Next: ${plan.pulse.focus}`].filter(Boolean).join('  ·  ')}
            />
          </>
        )}

        {plan.ideas.length > 0 && (
          <>
            <div className="plan-section">Ideas</div>
            {plan.ideas.map((text, i) => (
              <PlanRow
                key={i}
                checked={ideasOn[i]}
                onToggle={() => setIdeasOn((a) => a.map((v, j) => (j === i ? !v : v)))}
                title={text}
              />
            ))}
          </>
        )}

        <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} onClick={apply} disabled={count === 0}>
          <Check size={16} /> Add {count} {count === 1 ? 'item' : 'items'}
        </button>
      </div>
    </div>
  )
}

function PlanRow({ checked, onToggle, eyebrow, title, sub }) {
  return (
    <button className={`plan-row ${checked ? 'on' : ''}`} onClick={onToggle}>
      <span className={`plan-check ${checked ? 'on' : ''}`}>{checked && <Check size={13} />}</span>
      <span className="grow" style={{ textAlign: 'left' }}>
        {eyebrow && <span className="plan-eyebrow">{eyebrow}</span>}
        <span className="plan-title">{title}</span>
        {sub && <span className="plan-sub">{sub}</span>}
      </span>
    </button>
  )
}
