// Vercel serverless function: mints a short-lived Speechmatics token so the
// long-lived API key never reaches the browser.
//
// The browser calls GET /api/speechmatics-token and receives { token }, which
// is passed to the Speechmatics real-time client. Tokens expire quickly (TTL
// below), so even if intercepted they are only briefly useful.

const SPEECHMATICS_MP_URL = 'https://mp.speechmatics.com/v1/api_keys?type=rt'
const TOKEN_TTL_SECONDS = 3600 // 1 hour

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.SPEECHMATICS_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: 'SPEECHMATICS_API_KEY is not configured on the server.',
    })
  }

  try {
    const upstream = await fetch(SPEECHMATICS_MP_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: TOKEN_TTL_SECONDS }),
    })

    if (!upstream.ok) {
      const detail = await upstream.text()
      return res.status(502).json({
        error: 'Failed to obtain Speechmatics token.',
        detail,
      })
    }

    const data = await upstream.json()
    // Avoid any intermediary caching of the short-lived token.
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ token: data.key_value })
  } catch (err) {
    return res.status(500).json({
      error: 'Unexpected error minting Speechmatics token.',
      detail: String(err?.message || err),
    })
  }
}
