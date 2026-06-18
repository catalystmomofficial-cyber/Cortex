# Cortex

Your private business operating system — a mobile-first PWA.

The **Voice Mode** is a live AI advisor: tap a prompt or speak, and the gold
orb moves while it listens, thinks, and speaks its answer back (like ChatGPT /
Gemini voice). Speech-to-text is **Speechmatics**; the brain is **Google
Gemini**; the reply is spoken with the browser's built-in voice.

Both API keys live **server-side** (Vercel serverless functions) — there is no
key field or banner anywhere in the app.

## Run locally

```bash
npm install
vercel dev    # serves the app + /api functions (voice + AI need these)
```

`npm run dev` runs the UI only; the advisor/voice need the `/api` routes, so
use `vercel dev` (or a deployment) to exercise them.

## Environment variables

Set these in Vercel → Project → Settings → Environment Variables (and in a
local `.env.local` for `vercel dev`). See `.env.example`.

```
SPEECHMATICS_API_KEY=...   # api/speechmatics-token.js (real-time voice)
GEMINI_API_KEY=...         # api/gemini.js (advisor)  — free key: https://aistudio.google.com/app/apikey
```

## Deploy

Import the repo into Vercel, add the two env vars, deploy. Vite is
auto-detected; `api/` becomes serverless functions; `vercel.json` handles SPA
routing.
