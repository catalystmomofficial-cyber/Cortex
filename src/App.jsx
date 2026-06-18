import { useState } from 'react'
import { Home, Target, Lightbulb, MessageSquare, User } from 'lucide-react'
import Pulse from './views/Pulse'
import Goals from './views/Goals'
import Advisor from './views/Advisor'
import Capture from './views/Capture'
import Settings from './views/Settings'
import VoiceOverlay from './components/VoiceOverlay'
import InstallPrompt from './components/InstallPrompt'

const TABS = [
  { id: 'pulse', label: 'Home', icon: Home },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'capture', label: 'Ideas', icon: Lightbulb },
  { id: 'advisor', label: 'Advisor', icon: MessageSquare },
  { id: 'settings', label: 'Profile', icon: User },
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

  const openVoice = () => setVoiceOpen(true)

  return (
    <div className="app">
      {view === 'pulse' && <Pulse onNavigate={go} />}
      {view === 'goals' && <Goals />}
      {view === 'advisor' && (
        <Advisor
          handoff={voiceHandoff?.destination === 'advisor' ? voiceHandoff : null}
          onHandoffConsumed={() => setVoiceHandoff(null)}
          onNavigate={go}
          onVoice={openVoice}
        />
      )}
      {view === 'capture' && (
        <Capture
          handoff={voiceHandoff?.destination === 'capture' ? voiceHandoff : null}
          onHandoffConsumed={() => setVoiceHandoff(null)}
          onVoice={openVoice}
        />
      )}
      {view === 'settings' && <Settings onNavigate={go} />}

      <nav className="nav">
        {TABS.map((t) => (
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
      <span className="nav-ring">
        <Icon size={19} strokeWidth={active ? 2.4 : 1.9} />
      </span>
      <span>{tab.label}</span>
    </button>
  )
}
