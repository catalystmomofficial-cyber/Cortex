// Talks to our own /api/gemini serverless proxy (which holds the key). Streams
// the reply via SSE so chat and voice feel responsive.

export const GEMINI_MODELS = [
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (fast)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (smarter)' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (legacy)' },
]

/**
 * Stream a completion from the Gemini proxy.
 * @param {object} args
 * @param {string} args.model
 * @param {string} args.system
 * @param {Array}  args.messages - [{role:'user'|'assistant', content}]
 * @param {(delta:string)=>void} [args.onDelta]
 * @param {AbortSignal} [args.signal]
 * @returns {Promise<string>} full text
 */
export async function streamChat({ model, system, messages, onDelta, signal }) {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, system, messages }),
    signal,
  })

  if (!res.ok || !res.body) {
    let detail = ''
    try {
      const err = await res.json()
      detail = err?.error || err?.detail || ''
    } catch {
      detail = await res.text().catch(() => '')
    }
    if (res.status === 500 && /not configured/i.test(detail)) throw new Error('NO_SERVER_KEY')
    throw new Error(detail || `AI error ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let nl
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload)
        const parts = json?.candidates?.[0]?.content?.parts || []
        for (const p of parts) {
          if (p.text) {
            full += p.text
            onDelta?.(p.text)
          }
        }
      } catch {
        /* partial JSON across chunks — ignore */
      }
    }
  }

  return full
}
