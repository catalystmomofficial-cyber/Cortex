import { useMemo, useState } from 'react'
import { Lightbulb, ArrowRight, AlertTriangle, Sparkles, Plus, ClipboardList } from 'lucide-react'
import Header from '../components/Header'
import { useStore, STATUS_META } from '../store'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const todayLabel = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})

export default function Pulse({ onNavigate }) {
  const { state, dispatch } = useStore()
  const [quick, setQuick] = useState('')

  const counts = useMemo(() => {
    const c = { on: 0, risk: 0, off: 0, overdue: 0 }
    for (const g of state.goals) c[g.status] = (c[g.status] || 0) + 1
    return c
  }, [state.goals])

  const attention = state.goals.filter((g) => g.status === 'risk' || g.status === 'off' || g.status === 'overdue')
  const profileEmpty = !state.profile.business && !state.profile.win90
  const recentIdeas = state.ideas.slice(0, 3)

  function addQuick() {
    if (!quick.trim()) return
    dispatch({ type: 'ADD_IDEA', text: quick })
    setQuick('')
  }

  return (
    <div className="screen">
      <Header
        eyebrow="Business Operating System"
        title={`${greeting()}.`}
        subtitle={todayLabel}
        onSettings={() => onNavigate('settings')}
      />

      {/* Focus hero */}
      <div
        className="card"
        style={{
          background:
            attention.length > 0
              ? 'linear-gradient(135deg, rgba(245,166,35,0.16), rgba(245,166,35,0.04))'
              : 'var(--surface)',
          borderColor: attention.length > 0 ? 'rgba(245,166,35,0.3)' : 'var(--border)',
        }}
      >
        {profileEmpty ? (
          <>
            <div className="row" style={{ marginBottom: 8 }}>
              <Sparkles size={20} color="var(--amber)" />
              <strong>Quick Setup</strong>
            </div>
            <p className="muted" style={{ fontSize: 14 }}>
              Tell Cortex about your business so your advisor can give sharp, relevant guidance.
            </p>
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 14 }}
              onClick={() => onNavigate('settings')}
            >
              Set up your business <ArrowRight size={16} />
            </button>
          </>
        ) : attention.length > 0 ? (
          <>
            <div className="row" style={{ marginBottom: 8 }}>
              <AlertTriangle size={20} color="var(--amber)" />
              <strong>
                {attention.length} {attention.length === 1 ? 'goal needs' : 'goals need'} attention
              </strong>
            </div>
            <div className="stack" style={{ gap: 8, marginTop: 4 }}>
              {attention.slice(0, 3).map((g) => (
                <div className="row" key={g.id}>
                  <span className={`status-dot ${STATUS_META[g.status].dot}`} />
                  <span className="grow truncate">{g.title}</span>
                  <span className="faint" style={{ fontSize: 12 }}>
                    {STATUS_META[g.status].label}
                  </span>
                </div>
              ))}
            </div>
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 14 }}
              onClick={() => onNavigate('advisor')}
            >
              Ask your advisor what to do <ArrowRight size={16} />
            </button>
          </>
        ) : (
          <>
            <div className="row" style={{ marginBottom: 8 }}>
              <Sparkles size={20} color="var(--green)" />
              <strong>You're on track</strong>
            </div>
            <p className="muted" style={{ fontSize: 14 }}>
              Nothing's flagged. Capture an idea or ask your advisor what to focus on next.
            </p>
          </>
        )}
      </div>

      {/* Goal summary */}
      <div className="section-title">
        <h2>Goals</h2>
        <button className="chip" onClick={() => onNavigate('goals')}>
          View all <ArrowRight size={13} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {Object.entries(STATUS_META).map(([key, meta]) => (
          <div key={key} className="card" style={{ padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: meta.color }}>{counts[key] || 0}</div>
            <div className="faint" style={{ fontSize: 10.5, marginTop: 2 }}>
              {meta.label}
            </div>
          </div>
        ))}
      </div>

      {/* Quick capture */}
      <div className="section-title">
        <h2>Quick Capture</h2>
      </div>
      <div className="card">
        <div className="row">
          <Lightbulb size={18} color="var(--amber)" />
          <input
            className="input grow"
            style={{ background: 'transparent', border: 'none', padding: '4px 0' }}
            placeholder="Type an idea…"
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addQuick()}
          />
          <button className="btn-icon" onClick={addQuick} aria-label="Save idea">
            <Plus size={20} />
          </button>
        </div>
      </div>

      {/* Recent ideas */}
      {recentIdeas.length > 0 && (
        <>
          <div className="section-title">
            <h2>Latest Ideas</h2>
            <button className="chip" onClick={() => onNavigate('capture')}>
              View all <ArrowRight size={13} />
            </button>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {recentIdeas.map((idea) => (
              <div className="card" key={idea.id} style={{ padding: 13 }}>
                <div className="row">
                  <ClipboardList size={15} color="var(--text-faint)" />
                  <span className="grow truncate">{idea.text}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
