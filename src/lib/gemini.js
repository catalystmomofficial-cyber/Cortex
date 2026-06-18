// Minimal Google Gemini client. The user's API key is stored locally (in the
// app's settings) and sent directly to Google's Generative Language API.
// We stream responses via SSE for a responsive chat experience.

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

export const GEMINI_MODELS = [
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (fast, free tier)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (smarter)' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (legacy)' },
]

// Convert our {role:'user'|'assistant', content} messages to Gemini contents.
function toContents(messages) {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
}

/**
 * Stream a completion from Gemini.
 * @param {object} args
 * @param {string} args.apiKey
 * @param {string} args.model
 * @param {string} args.system - system instruction
 * @param {Array}  args.messages - [{role, content}]
 * @param {(delta:string)=>void} args.onDelta - called with each text chunk
 * @param {AbortSignal} [args.signal]
 * @returns {Promise<string>} the full text
 */
export async function streamChat({ apiKey, model, system, messages, onDelta, signal }) {
  if (!apiKey) throw new Error('NO_KEY')

  const url = `${BASE}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`

  const body = {
    contents: toContents(messages),
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1400,
    },
  }
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    let detail = ''
    try {
      const err = await res.json()
      detail = err?.error?.message || ''
    } catch {
      detail = await res.text().catch(() => '')
    }
    if (res.status === 400 && /API key/i.test(detail)) throw new Error('BAD_KEY')
    if (res.status === 429) throw new Error('RATE_LIMIT')
    throw new Error(detail || `Gemini error ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
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
        /* partial JSON across chunks — ignore, it will reform next read */
      }
    }
  }

  return full
}
