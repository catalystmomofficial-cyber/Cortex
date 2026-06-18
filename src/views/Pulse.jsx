import { useMemo, useState } from 'react'
import { Target, TrendingUp, Gem, Hexagon, Check, X } from 'lucide-react'
import { useStore, STATUS_META, DOMAINS, domainHealth } from '../store'

const DOMAIN_ICONS = { 'trending-up': TrendingUp, gem: Gem, hexagon: Hexagon }

// Tinted badge styles per status (green / gold / red), matching the original.
function badgeStyle(status) {
  const map = {
    on: ['rgba(95,211,155,0.14)', 'var(--green)'],
    risk: ['rgba(233,205,135,0.16)', 'var(--gold-bright)'],
    off: ['rgba(224,153,90,0.16)', 'var(--orange)'],
    overdue: ['rgba(224,122,114,0.16)', 'var(--red)'],
  }
  const [bg, color] = map[status] || map.on
  return { background: bg, color }
}

export default function Pulse({ onNavigate }) {
  const { state, dispatch } = useStore()
  const [editingFocus, setEditingFocus] = useState(false)
  const [pulseOpen, setPulseOpen] = useState(false)

  const stats = useMemo(() => {
    const total = state.goals.length
    const onTrack = state.goals.filter((g) => g.status === 'on').length
    const action = total - onTrack
    return { total, onTrack, action }
  }, [state.goals])

  const domains = useMemo(
    () =>
      DOMAINS.map((d) => {
        const goals = state.goals.filter((g) => (g.domain || 'growth') === d.id)
        return { ...d, count: goals.length, ...domainHealth(goals) }
      }),
    [state.goals]
  )

  return (
    <div className="screen">
      {/* Header */}
      <div className="header">
        <div>
          <div className="wordmark">CORTEX</div>
          <div className="home-sub">Your Business · Private</div>
        </div>
        <button className="pulse-btn" onClick={() => setPulseOpen(true)}>
          Weekly Pulse
        </button>
      </div>

      {/* Today's One Thing */}
      <button
        className="one-thing"
        style={{ width: '100%', textAlign: 'left', display: 'block' }}
        onClick={() => setEditingFocus(true)}
      >
        <div className="eyebrow-row">
          <Target size={14} color="var(--gold)" />
          <span>Today's One Thing</span>
        </div>
        <div className={`body ${state.profile.focus ? '' : 'placeholder'}`}>
          {state.profile.focus || 'Tap to set the one thing that matters most today.'}
        </div>
      </button>

      {/* Stats */}
      <div className="stat-row" style={{ marginTop: 12 }}>
        <div className="stat-tile">
          <div className="num" style={{ color: 'var(--text)' }}>
            {stats.total}
          </div>
          <div className="lbl">Goals</div>
        </div>
        <div className="stat-tile">
          <div className="num" style={{ color: 'var(--green)' }}>
            {stats.onTrack}
          </div>
          <div className="lbl">On Track</div>
        </div>
        <div className="stat-tile">
          <div className="num" style={{ color: stats.action > 0 ? 'var(--red)' : 'var(--text)' }}>
            {stats.action}
          </div>
          <div className="lbl">Action</div>
        </div>
      </div>

      {/* Domain Health */}
      <div className="section-title">
        <h2 style={{ letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: 12, color: 'var(--text-faint)' }}>
          Domain Health
        </h2>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        {domains.map((d) => {
          const Icon = DOMAIN_ICONS[d.icon] || Target
          const meta = STATUS_META[d.status]
          return (
            <div
              key={d.id}
              className="domain-card"
              style={{ borderLeftColor: meta.color }}
              onClick={() => onNavigate('goals')}
            >
              <div className="d-icon">
                <Icon size={20} color={meta.color} />
              </div>
              <div className="grow">
                <div className="d-title">{d.label}</div>
                <div className="d-sub">
                  {d.count} {d.count === 1 ? 'goal' : 'goals'}
                </div>
              </div>
              <span className="health-badge" style={badgeStyle(d.status)}>
                {d.empty ? 'No goals' : meta.label}
              </span>
            </div>
          )
        })}
      </div>

      {editingFocus && (
        <FocusSheet
          initial={state.profile.focus}
          onClose={() => setEditingFocus(false)}
          onSave={(v) => {
            dispatch({ type: 'UPDATE_PROFILE', patch: { focus: v } })
            setEditingFocus(false)
          }}
        />
      )}

      {pulseOpen && (
        <WeeklyPulseSheet
          onClose={() => setPulseOpen(false)}
          onSave={(pulse) => {
            dispatch({ type: 'ADD_PULSE', pulse })
            if (pulse.focus) dispatch({ type: 'UPDATE_PROFILE', patch: { focus: pulse.focus } })
            setPulseOpen(false)
          }}
        />
      )}
    </div>
  )
}

function FocusSheet({ initial, onClose, onSave }) {
  const [value, setValue] = useState(initial || '')
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: 17 }}>Today's One Thing</strong>
          <button className="btn-icon" style={{ width: 36, height: 36 }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <textarea
          className="textarea"
          rows={3}
          autoFocus
          placeholder="e.g. Finalise the Q3 cost review with your supplier"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={() => onSave(value.trim())}>
          <Check size={16} /> Set Focus
        </button>
      </div>
    </div>
  )
}

function WeeklyPulseSheet({ onClose, onSave }) {
  const [win, setWin] = useState('')
  const [blocker, setBlocker] = useState('')
  const [focus, setFocus] = useState('')
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 4 }}>
          <strong style={{ fontSize: 17 }}>Weekly Pulse</strong>
          <button className="btn-icon" style={{ width: 36, height: 36 }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p className="faint" style={{ fontSize: 13, marginBottom: 14 }}>
          Take 2 minutes to check in on the week.
        </p>

        <label className="label">Biggest win this week</label>
        <input className="input" value={win} onChange={(e) => setWin(e.target.value)} placeholder="What moved forward?" />

        <label className="label" style={{ marginTop: 14 }}>
          Biggest blocker
        </label>
        <input
          className="input"
          value={blocker}
          onChange={(e) => setBlocker(e.target.value)}
          placeholder="What's in the way?"
        />

        <label className="label" style={{ marginTop: 14 }}>
          The one thing for next
        </label>
        <input
          className="input"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="Sets your Today's One Thing"
        />

        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: 18 }}
          onClick={() => onSave({ win: win.trim(), blocker: blocker.trim(), focus: focus.trim() })}
        >
          <Check size={16} /> Save Pulse
        </button>
      </div>
    </div>
  )
}
