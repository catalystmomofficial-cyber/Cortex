# CLAUDE.md — how to work on Cortex

Guidance for any AI coding agent working in this repo. This file ships nothing
to users (the build ignores it); it only shapes how code gets written.

## Lean-code ladder (Ponytail)

Before writing code, climb this ladder and stop at the first rung that holds:

1. Does it need to exist? No → skip it (YAGNI).
2. Stdlib / language built-in does it? → use it.
3. Native platform feature? → use it (e.g. `<input type="date">`, the Web
   Speech API, `speechSynthesis` — not a library).
4. Already-installed dependency does it? → use it.
5. One line? → write one line.
6. Only then → write the minimum that actually works.

Lazy, not careless: never cut input validation at trust boundaries, error
handling that prevents data loss, security, or accessibility.

Prefer: deletion over addition · boring over clever · fewest files · no
unrequested abstractions · no new dependency if it can be avoided.

## What Cortex is

A mobile-first PWA: a private business operating system. Screens: Home (Pulse),
Goals, Idea Dump (Capture), Advisor (chat + Voice Mode), Profile (Settings).

## Stack & conventions

- **React 18 + Vite 6**, plain JS (no TypeScript), CSS with design tokens in
  `src/index.css`. No state library — a `useReducer` store in `src/store.jsx`
  persisted to `localStorage`.
- **No new dependencies without a clear reason.** Current runtime deps:
  `react`, `react-dom`, `lucide-react`. Keep it that way.
- **Free-tier first.** Voice uses the browser's free Web Speech API + built-in
  `speechSynthesis`; the advisor uses Google Gemini.
- **Secrets stay server-side.** `GEMINI_API_KEY` (and `SPEECHMATICS_API_KEY`,
  legacy) live in Vercel env vars and are used only by the `api/` serverless
  functions. Never put keys or key-entry UI in the client.
- **Deploy:** Vercel auto-builds from `main`; `api/` are serverless functions.
- Match the existing file's style; keep components small and colocated.

## Don't break

- The advisor conversation logic (typed + voice share one thread).
- The voice pipeline (`useVoiceRecognition`, `useDictation`, `lib/speech`,
  `lib/audio`) — it was hard-won; change carefully.
- The warm black + champagne-gold look and the built-in (default) TTS voice.
