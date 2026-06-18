# Cortex

Your private business operating system — a mobile-first PWA for capturing
ideas, tracking growth goals, running a weekly pulse, and talking to an
AI business advisor with built-in real-time voice.

## Features

- **Pulse** — daily home dashboard: greeting, goal health, what needs
  attention, quick capture.
- **Goals** — growth goals with status (On Track / At Risk / Off Track /
  Overdue), wins, and due dates.
- **Idea Dump (Capture)** — frictionless idea capture, by text or voice.
- **Advisor** — a context-aware AI business advisor powered by **Google
  Gemini**. It knows your business profile, goals, and ideas, and streams
  replies in real time.
- **Voice Mode** — immersive, real-time speech-to-text via **Speechmatics**,
  routed into Capture or the Advisor.
- Installable PWA with offline support.

## Tech

- React 18 + Vite 6
- Google Gemini (Generative Language API) — key is user-provided, stored
  locally in the browser
- Speechmatics real-time transcription via the official browser SDKs
- A single Vercel serverless function to mint short-lived Speechmatics tokens
- All app data is stored locally (`localStorage`) — nothing leaves the device
  except the AI/voice API calls.

## Getting started

```bash
npm install
npm run dev        # Vite dev server (UI + Gemini work; voice needs the API route)
```

The **Advisor** works in plain `npm run dev`: open the app, go to
**Settings**, and paste a free Gemini API key from
<https://aistudio.google.com/app/apikey>.

**Voice Mode** needs the serverless token endpoint, so run it the way Vercel
runs it:

```bash
npm i -g vercel
vercel dev         # serves the app + /api/speechmatics-token
```

### Environment variables

Copy `.env.example` to `.env.local` and set:

```
SPEECHMATICS_API_KEY=your-speechmatics-api-key
```

This key is used **only** by `api/speechmatics-token.js` on the server and is
never exposed to the browser. The Gemini key is entered in-app and is not an
environment variable.

## Deploy (Vercel)

1. Import the repo into Vercel.
2. Add the `SPEECHMATICS_API_KEY` environment variable in
   **Project → Settings → Environment Variables**.
3. Deploy. Vite is auto-detected; `api/` is deployed as serverless functions;
   `vercel.json` handles SPA routing.

## Project structure

```
api/speechmatics-token.js   Serverless: mints short-lived Speechmatics tokens
public/                     PWA manifest, service worker, icons
src/
  lib/gemini.js             Gemini streaming client
  hooks/useSpeechmatics.js  Real-time voice transcription hook
  store.jsx                 localStorage-backed app state
  views/                    Pulse, Goals, Capture, Advisor, Settings
  components/               VoiceOverlay, Header, InstallPrompt
scripts/gen-icons.mjs       Regenerates the PWA icons
```
