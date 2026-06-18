// Vercel serverless function: proxies streaming chat to Google Gemini using a
// server-side GEMINI_API_KEY. The browser never sees the key — so there is no
// key field or "connect your AI" banner anywhere in the app.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' })
  }

  // Pin the model server-side to the higher-free-tier Flash model for
  // reliability (the 2.5 model rate-limits much sooner on the free plan).
  const model = 'gemini-2.0-flash'
  const { system, messages = [] } = req.body || {}

  const contents = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

  const body = {
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
  }
  if (system) body.systemInstruction = { parts: [{ text: system }] }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '')
      return res.status(502).json({ error: 'Gemini request failed.', detail })
    }

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
    res.end()
  } catch (err) {
    return res.status(500).json({ error: 'Unexpected error talking to Gemini.', detail: String(err?.message || err) })
  }
}
