import { Settings as SettingsIcon } from 'lucide-react'

export default function Header({ eyebrow, title, subtitle, onSettings, right }) {
  return (
    <div className="header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <div className="sub">{subtitle}</div>}
      </div>
      <div className="row">
        {right}
        {onSettings && (
          <button className="btn-icon" aria-label="Settings" onClick={onSettings}>
            <SettingsIcon size={20} />
          </button>
        )}
      </div>
    </div>
  )
}
