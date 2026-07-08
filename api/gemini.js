// Vercel serverless function: proxies the advisor's chat to GLM-5.2 via NVIDIA
// (primary brain), falling back to Google Gemini only if NVIDIA is unavailable.
// Both keys stay server-side — the browser never sees them.
//
// The client speaks ONE stream shape (Gemini's candidates[].content.parts[].text),
// so we translate GLM's OpenAI-style SSE into that shape here — no client change,
// nothing in the chat/voice pipeline has to know the brain swapped.

// GLM-5.2 via NVIDIA's hosted, OpenAI-compatible LLM API (reliable — this is
// NVIDIA's inference endpoint, NOT the cold-starting NVCF TTS one). Same
// nvapi- key you already have.
const GLM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const GLM_MODELS = ['z-ai/glm-5.2']

// Gemini fallback models (only used if NVIDIA/GLM is down / has no key).
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash', 'gemini-2.5-flash-lite']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const nvidiaKey = process.env.NVIDIA_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  if (!nvidiaKey && !geminiKey) {
    return res.status(500).json({ error: 'No AI key is configured on the server.' })
  }

  const { system, messages = [], json = false } = req.body || {}
  const chat = messages.filter((m) => m.role === 'user' || m.role === 'assistant')

  // ---------- Primary brain: GLM-5.2 via NVIDIA (OpenAI-compatible) ----------
  if (nvidiaKey) {
    const oaMessages = []
    if (system) oaMessages.push({ role: 'system', content: system })
    for (const m of chat) oaMessages.push({ role: m.role, content: m.content })

    const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${nvidiaKey}` }

    try {
      // JSON mode: single non-streaming object (used by "organize into my plan").
      if (json) {
        for (const model of GLM_MODELS) {
          let up
          try {
            up = await fetch(GLM_URL, {
              method: 'POST',
              headers: auth,
              body: JSON.stringify({
                model,
                messages: oaMessages,
                temperature: 0.2,
                max_tokens: 2048,
                response_format: { type: 'json_object' },
              }),
            })
          } catch {
            continue
          }
          if (up.ok) {
            const data = await up.json()
            const text = data?.choices?.[0]?.message?.content || ''
            res.setHeader('Cache-Control', 'no-store')
            return res.status(200).json({ text })
          }
        }
      } else {
        // Streaming chat: translate GLM's OpenAI SSE → the Gemini shape the client reads.
        for (const model of GLM_MODELS) {
          let up
          try {
            up = await fetch(GLM_URL, {
              method: 'POST',
              headers: auth,
              body: JSON.stringify({
                model,
                messages: oaMessages,
                temperature: 0.7,
                max_tokens: 1200,
                stream: true,
              }),
            })
          } catch {
            continue
          }
          if (up.ok && up.body) {
            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-store')
            res.setHeader('Connection', 'keep-alive')
            const reader = up.body.getReader()
            const decoder = new TextDecoder()
            let buf = ''
            for (;;) {
              const { value, done } = await reader.read()
              if (done) break
              buf += decoder.decode(value, { stream: true })
              let nl
              while ((nl = buf.indexOf('\n')) !== -1) {
                const line = buf.slice(0, nl).trim()
                buf = buf.slice(nl + 1)
                if (!line.startsWith('data:')) continue
                const p = line.slice(5).trim()
                if (!p || p === '[DONE]') continue
                try {
                  const j = JSON.parse(p)
                  const delta = j?.choices?.[0]?.delta?.content || ''
                  if (delta) {
                    res.write(
                      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: delta }] } }] })}\n\n`
                    )
                  }
                } catch {
                  /* partial JSON across chunks — ignore */
                }
              }
            }
            return res.end()
          }
        }
      }
    } catch {
      /* GLM threw — fall through to Gemini if we can */
    }
    // GLM failed for every model. If there's no Gemini backup, surface it.
    if (!geminiKey) {
      return res.status(502).json({ error: 'GLM (NVIDIA) request failed.' })
    }
    // else: fall through to the Gemini fallback below.
  }

  // ---------- Fallback brain: Google Gemini ----------
  const contents = chat.map((m) => ({
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

  if (json) {
    try {
      for (const model of GEMINI_MODELS) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`
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
      return res.status(502).json({ error: 'AI request failed.', status: lastStatus, detail: lastDetail })
    } catch (err) {
      return res.status(500).json({ error: 'Unexpected error talking to the AI.', detail: String(err?.message || err) })
    }
  }

  try {
    for (const model of GEMINI_MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${geminiKey}`
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
      lastStatus = upstream.status
      lastDetail = await upstream.text().catch(() => '')
    }
    return res.status(502).json({ error: 'AI request failed.', status: lastStatus, detail: lastDetail })
  } catch (err) {
    return res.status(500).json({ error: 'Unexpected error talking to the AI.', detail: String(err?.message || err) })
  }
}
