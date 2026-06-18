import { useState } from 'react'
import { Plus, Target, Trash2, X, Check } from 'lucide-react'
import Header from '../components/Header'
import { useStore, STATUS_META, DOMAINS } from '../store'

const STATUS_ORDER = ['on', 'risk', 'off', 'overdue']

export default function Goals() {
  const { state, dispatch } = useStore()
  const [editing, setEditing] = useState(null) // null | 'new' | goalObject

  return (
    <div className="screen">
      <Header
        eyebrow="Growth"
        title="Goals"
        subtitle={`${state.goals.length} ${state.goals.length === 1 ? 'goal' : 'goals'}`}
        right={
          <button className="btn-icon" aria-label="New goal" onClick={() => setEditing('new')}>
            <Plus size={22} />
          </button>
        }
      />

      {state.goals.length === 0 ? (
        <div className="empty">
          <div className="icon">
            <Target size={26} />
          </div>
          <div style={{ color: 'var(--text-dim)', fontWeight: 600, marginBottom: 4 }}>No goals yet</div>
          <div style={{ fontSize: 14 }}>Set your first growth goal below.</div>
          <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={() => setEditing('new')}>
            <Plus size={16} /> New Goal
          </button>
        </div>
      ) : (
        <div className="stack">
          {state.goals.map((g) => (
            <GoalCard key={g.id} goal={g} onEdit={() => setEditing(g)} dispatch={dispatch} />
          ))}
        </div>
      )}

      {editing && (
        <GoalEditor
          goal={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          dispatch={dispatch}
        />
      )}
    </div>
  )
}

function GoalCard({ goal, onEdit, dispatch }) {
  const meta = STATUS_META[goal.status]

  function cycleStatus(e) {
    e.stopPropagation()
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(goal.status) + 1) % STATUS_ORDER.length]
    dispatch({ type: 'UPDATE_GOAL', id: goal.id, patch: { status: next } })
  }

  return (
    <div className="card" onClick={onEdit}>
      <div className="row between">
        <div className="grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{goal.title}</div>
          {goal.win && (
            <div className="faint" style={{ fontSize: 13, marginTop: 3 }}>
              Win: {goal.win}
            </div>
          )}
        </div>
        <button
          className="chip"
          onClick={cycleStatus}
          style={{ color: meta.color, borderColor: 'transparent', background: 'var(--surface-strong)' }}
        >
          <span className={`status-dot ${meta.dot}`} />
          {meta.label}
        </button>
      </div>
      {goal.due && (
        <div className="faint" style={{ fontSize: 12, marginTop: 10 }}>
          Due {new Date(goal.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </div>
      )}
    </div>
  )
}

function GoalEditor({ goal, onClose, dispatch }) {
  const [title, setTitle] = useState(goal?.title || '')
  const [win, setWin] = useState(goal?.win || '')
  const [status, setStatus] = useState(goal?.status || 'on')
  const [due, setDue] = useState(goal?.due || '')
  const [domain, setDomain] = useState(goal?.domain || 'growth')

  function save() {
    if (!title.trim()) return
    if (goal) {
      dispatch({ type: 'UPDATE_GOAL', id: goal.id, patch: { title: title.trim(), win, status, due, domain } })
    } else {
      dispatch({ type: 'ADD_GOAL', title: title.trim(), win, status, due, domain })
    }
    onClose()
  }

  function remove() {
    dispatch({ type: 'DELETE_GOAL', id: goal.id })
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 18 }}>
          <strong style={{ fontSize: 17 }}>{goal ? 'Edit Goal' : 'New Goal'}</strong>
          <button className="btn-icon" style={{ width: 36, height: 36 }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <label className="label">Goal title</label>
        <input
          className="input"
          placeholder="Goal title…"
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
        />

        <label className="label" style={{ marginTop: 14 }}>
          Domain
        </label>
        <div className="row wrap" style={{ gap: 8 }}>
          {DOMAINS.map((d) => {
            const active = domain === d.id
            return (
              <button
                key={d.id}
                className="chip"
                onClick={() => setDomain(d.id)}
                style={{
                  color: active ? 'var(--gold-bright)' : 'var(--text-dim)',
                  borderColor: active ? 'var(--gold)' : 'var(--border)',
                  background: active ? 'var(--surface-strong)' : 'transparent',
                }}
              >
                {d.label}
              </button>
            )
          })}
        </div>

        <label className="label" style={{ marginTop: 14 }}>
          What does a WIN look like?
        </label>
        <input
          className="input"
          placeholder="e.g. 50 paying customers"
          value={win}
          onChange={(e) => setWin(e.target.value)}
        />

        <label className="label" style={{ marginTop: 14 }}>
          Status
        </label>
        <div className="row wrap" style={{ gap: 8 }}>
          {STATUS_ORDER.map((s) => {
            const meta = STATUS_META[s]
            const active = status === s
            return (
              <button
                key={s}
                className="chip"
                onClick={() => setStatus(s)}
                style={{
                  color: active ? meta.color : 'var(--text-dim)',
                  borderColor: active ? meta.color : 'var(--border)',
                  background: active ? 'var(--surface-strong)' : 'transparent',
                }}
              >
                <span className={`status-dot ${meta.dot}`} />
                {meta.label}
              </button>
            )
          })}
        </div>

        <label className="label" style={{ marginTop: 14 }}>
          Due date (optional)
        </label>
        <input
          className="input"
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />

        <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={save}>
          <Check size={16} /> {goal ? 'Save Goal' : 'Add Goal'}
        </button>
        {goal && (
          <button className="btn btn-danger btn-block" style={{ marginTop: 10 }} onClick={remove}>
            <Trash2 size={16} /> Delete Goal
          </button>
        )}
      </div>
    </div>
  )
}
