import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PCMAudioRecorderProvider } from '@speechmatics/browser-audio-input-react'
import workletScriptURL from '@speechmatics/browser-audio-input/pcm-audio-worklet.min.js?url'
import { StoreProvider } from './store'
import App from './App'
import './index.css'

// One shared AudioContext using the device's native sample rate. We do NOT
// force a rate: iOS Safari ignores a requested rate and records at the hardware
// rate (often 48 kHz), which would then mismatch what we tell Speechmatics. The
// recorder captures at this context's actual rate, and useSpeechmatics reads it
// back so the declared rate always matches the audio we send.
const audioContext =
  typeof window !== 'undefined' && window.AudioContext ? new AudioContext() : undefined

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StoreProvider>
      <PCMAudioRecorderProvider workletScriptURL={workletScriptURL} audioContext={audioContext}>
        <App />
      </PCMAudioRecorderProvider>
    </StoreProvider>
  </StrictMode>
)

// Register the service worker for offline / installable PWA support.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
