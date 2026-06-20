import { useState } from 'react'
import { X, Check } from 'lucide-react'
import { STATUS_META, DOMAINS } from '../store'

// Confirmation sheet: review what the advisor will file, toggle items, apply.
export default function PlanReview({ plan, onClose, onApply }) {
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
              title={[
                plan.pulse.win && `Win: ${plan.pulse.win}`,
                plan.pulse.blocker && `Blocker: ${plan.pulse.blocker}`,
                plan.pulse.focus && `Next: ${plan.pulse.focus}`,
              ]
                .filter(Boolean)
                .join('  ·  ')}
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
