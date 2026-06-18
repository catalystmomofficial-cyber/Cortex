import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PCMAudioRecorderProvider } from '@speechmatics/browser-audio-input-react'
import workletScriptURL from '@speechmatics/browser-audio-input/pcm-audio-worklet.min.js?url'
import { StoreProvider } from './store'
import { VOICE_SAMPLE_RATE } from './hooks/useSpeechmatics'
import App from './App'
import './index.css'

// One shared AudioContext at the rate Speechmatics expects. It starts
// suspended and is resumed by the recorder on the user's first tap.
const audioContext =
  typeof window !== 'undefined' && window.AudioContext
    ? new AudioContext({ sampleRate: VOICE_SAMPLE_RATE })
    : undefined

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
