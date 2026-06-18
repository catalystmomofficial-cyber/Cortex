import { useState } from 'react'
import { ArrowLeft, Check, Eye, EyeOff, ExternalLink, Mic, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { GEMINI_MODELS } from '../lib/gemini'

export default function Settings({ onNavigate }) {
  const { state, dispatch } = useStore()
  const [showKey, setShowKey] = useState(false)
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

      {/* AI */}
      <div className="section-title">
        <h2>AI Advisor (Google Gemini)</h2>
      </div>
      <div className="card stack">
        <div>
          <label className="label">Gemini API key</label>
          <div className="row" style={{ gap: 8 }}>
            <input
              className="input grow"
              type={showKey ? 'text' : 'password'}
              placeholder="Paste your Gemini API key"
              value={state.settings.geminiKey}
              onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', patch: { geminiKey: e.target.value.trim() } })}
            />
            <button className="btn-icon" onClick={() => setShowKey((s) => !s)} aria-label="Toggle key visibility">
              {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="row"
            style={{ fontSize: 13, color: 'var(--amber)', marginTop: 9, textDecoration: 'none' }}
          >
            Get a free key at Google AI Studio <ExternalLink size={13} />
          </a>
          <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>
            Stored only on this device. AI connects when your key is added.
          </p>
        </div>

        <div>
          <label className="label">Model</label>
          <select
            className="input"
            value={state.settings.geminiModel}
            onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', patch: { geminiModel: e.target.value } })}
          >
            {GEMINI_MODELS.map((m) => (
              <option key={m.id} value={m.id} style={{ background: '#1c160d' }}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Voice */}
      <div className="section-title">
        <h2>Voice</h2>
      </div>
      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <Mic size={18} color="var(--amber)" />
          <strong style={{ fontSize: 15 }}>Speechmatics transcription</strong>
        </div>
        <p className="faint" style={{ fontSize: 13 }}>
          Voice Mode uses Speechmatics for accurate, real-time transcription. The API key lives
          securely on the server (never in this app), so there's nothing to configure here.
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
