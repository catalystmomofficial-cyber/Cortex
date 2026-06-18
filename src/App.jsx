import { useState } from 'react'
import { Activity, Target, MessageSquare, Lightbulb, Mic } from 'lucide-react'
import Pulse from './views/Pulse'
import Goals from './views/Goals'
import Advisor from './views/Advisor'
import Capture from './views/Capture'
import Settings from './views/Settings'
import VoiceOverlay from './components/VoiceOverlay'
import InstallPrompt from './components/InstallPrompt'

const TABS = [
  { id: 'pulse', label: 'Pulse', icon: Activity },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'advisor', label: 'Advisor', icon: MessageSquare },
  { id: 'capture', label: 'Capture', icon: Lightbulb },
]

export default function App() {
  const [view, setView] = useState('pulse')
  const [voiceOpen, setVoiceOpen] = useState(false)
  // Text handed off from Voice Mode to a destination view.
  const [voiceHandoff, setVoiceHandoff] = useState(null)

  function go(v) {
    setView(v)
  }

  // Called when the user finishes a voice capture and picks a destination.
  function handleVoiceComplete(text, destination) {
    setVoiceOpen(false)
    if (!text?.trim()) return
    setVoiceHandoff({ text: text.trim(), destination, at: Date.now() })
    setView(destination)
  }

  return (
    <div className="app">
      {view === 'pulse' && <Pulse onNavigate={go} />}
      {view === 'goals' && <Goals />}
      {view === 'advisor' && (
        <Advisor
          handoff={voiceHandoff?.destination === 'advisor' ? voiceHandoff : null}
          onHandoffConsumed={() => setVoiceHandoff(null)}
          onNavigate={go}
        />
      )}
      {view === 'capture' && (
        <Capture
          handoff={voiceHandoff?.destination === 'capture' ? voiceHandoff : null}
          onHandoffConsumed={() => setVoiceHandoff(null)}
        />
      )}
      {view === 'settings' && <Settings onNavigate={go} />}

      <nav className="nav">
        {TABS.slice(0, 2).map((t) => (
          <NavItem key={t.id} tab={t} active={view === t.id} onClick={() => go(t.id)} />
        ))}
        <button className="nav-fab" aria-label="Voice mode" onClick={() => setVoiceOpen(true)}>
          <Mic size={24} strokeWidth={2.4} />
        </button>
        {TABS.slice(2).map((t) => (
          <NavItem key={t.id} tab={t} active={view === t.id} onClick={() => go(t.id)} />
        ))}
      </nav>

      {voiceOpen && (
        <VoiceOverlay onClose={() => setVoiceOpen(false)} onComplete={handleVoiceComplete} />
      )}

      <InstallPrompt />
    </div>
  )
}

function NavItem({ tab, active, onClick }) {
  const Icon = tab.icon
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      <Icon size={21} strokeWidth={active ? 2.4 : 2} />
      <span>{tab.label}</span>
    </button>
  )
}
