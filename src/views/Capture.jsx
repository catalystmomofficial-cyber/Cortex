import { useEffect, useRef, useState } from 'react'
import { Lightbulb, Plus, Trash2, Mic } from 'lucide-react'
import Header from '../components/Header'
import { useStore } from '../store'

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function Capture({ handoff, onHandoffConsumed, onVoice }) {
  const { state, dispatch } = useStore()
  const [text, setText] = useState('')
  const taRef = useRef(null)

  // Receive text dictated in Voice Mode.
  useEffect(() => {
    if (handoff?.text) {
      setText(handoff.text)
      onHandoffConsumed?.()
      requestAnimationFrame(() => taRef.current?.focus())
    }
  }, [handoff, onHandoffConsumed])

  function add() {
    if (!text.trim()) return
    dispatch({ type: 'ADD_IDEA', text })
    setText('')
  }

  return (
    <div className="screen">
      <Header
        eyebrow="Capture"
        title="Idea Dump"
        subtitle="Type your ideas. Sort later."
      />

      <div className="card">
        <textarea
          ref={taRef}
          className="textarea"
          rows={3}
          placeholder="Start capturing above…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ border: 'none', background: 'transparent', padding: 0 }}
        />
        <div className="row between" style={{ marginTop: 12 }}>
          <button
            className="chip"
            onClick={onVoice}
            style={{ color: 'var(--gold-bright)', borderColor: 'var(--border-strong)' }}
          >
            <Mic size={14} /> Speak instead
          </button>
          <button className="btn btn-primary" onClick={add} style={{ padding: '10px 16px' }}>
            <Plus size={16} /> Capture
          </button>
        </div>
      </div>

      <div className="section-title">
        <h2>Captured</h2>
        <span className="faint" style={{ fontSize: 13 }}>
          {state.ideas.length}
        </span>
      </div>

      {state.ideas.length === 0 ? (
        <div className="empty">
          <div className="icon">
            <Lightbulb size={26} />
          </div>
          <div style={{ fontSize: 14 }}>Your idea dump is empty.</div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {state.ideas.map((idea) => (
            <div className="card" key={idea.id} style={{ padding: 14 }}>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div style={{ fontSize: 15, lineHeight: 1.45 }}>{idea.text}</div>
                  <div className="faint" style={{ fontSize: 11.5, marginTop: 6 }}>
                    {timeAgo(idea.createdAt)}
                  </div>
                </div>
                <button
                  className="btn-icon"
                  style={{ width: 34, height: 34, background: 'transparent', border: 'none' }}
                  aria-label="Delete idea"
                  onClick={() => dispatch({ type: 'DELETE_IDEA', id: idea.id })}
                >
                  <Trash2 size={16} color="var(--text-faint)" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
