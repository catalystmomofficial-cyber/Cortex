import { useCallback, useEffect, useRef, useState } from 'react'

// Lightweight dictation using the Web Speech API: transcribes speech into a
// text field (like the Gemini mic). Calls onText(runningText) with the live
// transcript; the caller decides how to place it in the input. No audio-level
// capture — this is just speech-to-text that stays for editing/sending.
export function useDictation(onText) {
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)
  const listeningRef = useRef(false)
  const finalRef = useRef('')
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const supported =
    typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)

  const launch = useCallback(() => {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Rec) return
    const r = new Rec()
    r.continuous = true
    r.interimResults = true
    r.lang = 'en-US'

    r.onresult = (e) => {
      let interim = ''
      let finalAdd = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finalAdd += res[0].transcript
        else interim += res[0].transcript
      }
      if (finalAdd) {
        finalRef.current = `${finalRef.current} ${finalAdd}`.replace(/\s+/g, ' ').trim()
      }
      const running = `${finalRef.current} ${interim}`.replace(/\s+/g, ' ').trim()
      onTextRef.current?.(running)
    }

    r.onend = () => {
      if (listeningRef.current && recRef.current === r) {
        try {
          r.start()
        } catch {
          /* noop */
        }
      }
    }
    r.onerror = () => {}

    recRef.current = r
    try {
      r.start()
    } catch {
      /* noop */
    }
  }, [])

  const stop = useCallback(() => {
    listeningRef.current = false
    setListening(false)
    const r = recRef.current
    if (r) {
      r.onend = null
      r.onresult = null
      try {
        r.stop()
      } catch {
        /* noop */
      }
      recRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    if (!supported) return
    finalRef.current = ''
    listeningRef.current = true
    setListening(true)
    launch()
  }, [supported, launch])

  const toggle = useCallback(() => {
    if (listeningRef.current) stop()
    else start()
  }, [start, stop])

  useEffect(() => () => stop(), [stop])

  return { supported: !!supported, listening, start, stop, toggle }
}
