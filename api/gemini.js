// Vercel serverless function: proxies streaming chat to Google Gemini using a
// server-side GEMINI_API_KEY. The browser never sees the key — so there is no
// key field or "connect your AI" banner anywhere in the app.

// Try these models in order. Different keys/projects have access to different
// models, and the free tier rate-limits per model — so if one is unavailable
// (404) or busy (429), we transparently fall back to the next.
const MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash', 'gemini-2.5-flash-lite']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' })
  }

  const { system, messages = [], json = false } = req.body || {}

  const contents = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

  const generationConfig = { temperature: json ? 0.2 : 0.7, maxOutputTokens: json ? 2048 : 1200 }
  if (json) generationConfig.responseMimeType = 'application/json'

  const body = { contents, generationConfig }
  if (system) body.systemInstruction = { parts: [{ text: system }] }
  const payload = JSON.stringify(body)

  let lastStatus = 502
  let lastDetail = ''

  // JSON mode: non-streaming, return a single parsed JSON blob.
  if (json) {
    try {
      for (const model of MODELS) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
        let upstream
        try {
          upstream = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
          })
        } catch (e) {
          lastDetail = String(e?.message || e)
          continue
        }
        if (upstream.ok) {
          const data = await upstream.json()
          const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
          res.setHeader('Cache-Control', 'no-store')
          return res.status(200).json({ text })
        }
        lastStatus = upstream.status
        lastDetail = await upstream.text().catch(() => '')
      }
      return res.status(502).json({ error: 'Gemini request failed.', status: lastStatus, detail: lastDetail })
    } catch (err) {
      return res.status(500).json({ error: 'Unexpected error talking to Gemini.', detail: String(err?.message || err) })
    }
  }

  try {
    for (const model of MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`
      let upstream
      try {
        upstream = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        })
      } catch (e) {
        lastDetail = String(e?.message || e)
        continue // network error — try next model
      }

      if (upstream.ok && upstream.body) {
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('Connection', 'keep-alive')
        const reader = upstream.body.getReader()
        const decoder = new TextDecoder()
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          res.write(decoder.decode(value, { stream: true }))
        }
        return res.end()
      }

      // Not ok — remember why and try the next model.
      lastStatus = upstream.status
      lastDetail = await upstream.text().catch(() => '')
    }

    // Every model failed.
    return res.status(502).json({ error: 'Gemini request failed.', status: lastStatus, detail: lastDetail })
  } catch (err) {
    return res.status(500).json({ error: 'Unexpected error talking to Gemini.', detail: String(err?.message || err) })
  }
}
