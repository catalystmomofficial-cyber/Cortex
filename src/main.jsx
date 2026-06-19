import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PCMAudioRecorderProvider } from '@speechmatics/browser-audio-input-react'
import workletScriptURL from '@speechmatics/browser-audio-input/pcm-audio-worklet.min.js?url'
import { StoreProvider } from './store'
import { sharedAudioContext } from './lib/audio'
import App from './App'
import './index.css'

const audioContext = sharedAudioContext

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
