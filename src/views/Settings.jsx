import { useState } from 'react'
import { ArrowLeft, Check, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { LANGUAGES } from '../lib/languages'

export default function Settings({ onNavigate }) {
  const { state, dispatch } = useStore()
  const [saved, setSaved] = useState(false)

  function setProfile(patch) {
    dispatch({ type: 'UPDATE_PROFILE', patch })
  }

  function flashSaved() {
    setSaved(true)
    setTimeout(() => setSaved(false), 1400)
  }

  function resetAll() {
    if (confirm('Reset everything? This deletes all goals, ideas, conversations and settings on this device.')) {
      dispatch({ type: 'RESET' })
      onNavigate('pulse')
    }
  }

  return (
    <div className="screen">
      <div className="header">
        <div className="row">
          <button className="btn-icon" aria-label="Back" onClick={() => onNavigate('pulse')}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="eyebrow">Profile</div>
            <h1 style={{ fontSize: 24 }}>Settings</h1>
          </div>
        </div>
      </div>

      {/* Business profile */}
      <div className="section-title">
        <h2>Your Business</h2>
      </div>
      <div className="card stack">
        <Field
          label="Company name"
          value={state.profile.company}
          onChange={(v) => setProfile({ company: v })}
          placeholder="e.g. Catalyst MDM"
        />
        <Field
          label="What do you sell or offer?"
          value={state.profile.business}
          onChange={(v) => setProfile({ business: v })}
          placeholder="e.g. Done-for-you bookkeeping for trades"
        />
        <Field
          label="Who is your customer?"
          value={state.profile.customer}
          onChange={(v) => setProfile({ customer: v })}
          placeholder="e.g. Solo electricians & plumbers"
        />
        <Field
          label="What's the offer?"
          value={state.profile.offer}
          onChange={(v) => setProfile({ offer: v })}
          placeholder="e.g. $399/mo monthly retainer"
        />
        <Field
          label="What does a WIN look like in 90 days?"
          value={state.profile.win90}
          onChange={(v) => setProfile({ win90: v })}
          placeholder="e.g. 25 retainer clients"
        />
      </div>

      <div className="section-title">
        <h2>Language</h2>
      </div>
      <div className="card">
        <label className="label">Advisor & voice language</label>
        <select
          className="input"
          value={state.settings.language || 'en-US'}
          onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', patch: { language: e.target.value } })}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code} style={{ background: '#16131a' }}>
              {l.label}
            </option>
          ))}
        </select>
        <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>
          The advisor listens, replies, and speaks in this language. Voice quality depends on the
          voices your device has installed.
        </p>
      </div>

      <button className="btn btn-primary btn-block" style={{ marginTop: 22 }} onClick={flashSaved}>
        <Check size={16} /> {saved ? 'Saved' : 'Done'}
      </button>

      <button className="btn btn-danger btn-block" style={{ marginTop: 10 }} onClick={resetAll}>
        <Trash2 size={16} /> Reset everything
      </button>

      <p className="faint" style={{ textAlign: 'center', fontSize: 11.5, marginTop: 20 }}>
        Cortex · your private business operating system
      </p>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
