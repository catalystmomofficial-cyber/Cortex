// Vercel serverless proxy: forwards advisor text to your VoxCPM endpoint
// (e.g. a Modal deploy) and streams the audio back. Keeps the endpoint URL and
// shared token server-side. If VOXCPM_URL isn't set, the client falls back to
// the free browser voice.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const url = process.env.VOXCPM_URL
  if (!url) return res.status(503).json({ error: 'VOXCPM_URL not configured' })

  const { text, language } = req.body || {}
  if (!text || !text.trim()) return res.status(400).json({ error: 'No text' })

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: language || 'en', token: process.env.VOXCPM_TOKEN || '' }),
    })
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '')
      return res.status(502).json({ error: 'TTS failed', detail })
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/wav')
    res.setHeader('Cache-Control', 'no-store')
    const buf = Buffer.from(await upstream.arrayBuffer())
    return res.status(200).send(buf)
  } catch (err) {
    return res.status(500).json({ error: 'TTS proxy error', detail: String(err?.message || err) })
  }
}
