import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

const DISMISS_KEY = 'cortex.install.dismissed'

// Shows an "Install as Phone App" banner using the beforeinstallprompt event
// (Chrome/Android). On iOS Safari the event never fires, so we stay quiet.
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return
    function onPrompt(e) {
      e.preventDefault()
      setDeferred(e)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  function dismiss() {
    setVisible(false)
    localStorage.setItem(DISMISS_KEY, '1')
  }

  async function install() {
    if (!deferred) return
    deferred.prompt()
    await deferred.userChoice.catch(() => {})
    setVisible(false)
    setDeferred(null)
  }

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'calc(86px + var(--safe-bottom))',
        maxWidth: 496,
        margin: '0 auto',
        zIndex: 60,
        background: 'var(--bg-elev-2)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius)',
        padding: 14,
        boxShadow: 'var(--shadow)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div className="grow">
        <div style={{ fontWeight: 600, fontSize: 14 }}>Install as Phone App</div>
        <div className="faint" style={{ fontSize: 12.5 }}>
          Add Cortex to your home screen for full-screen, offline access.
        </div>
      </div>
      <button className="btn btn-primary" style={{ padding: '10px 14px' }} onClick={install}>
        <Download size={16} /> Install
      </button>
      <button className="btn-icon" style={{ width: 36, height: 36 }} onClick={dismiss}>
        <X size={16} />
      </button>
    </div>
  )
}
