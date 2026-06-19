# Migrating Cortex Voice Mode to Pipecat (free, self-hosted)

This is the plan to move Voice Mode from the browser's Web Speech API to a
**self-hosted Pipecat** pipeline using only free / open-source pieces.

> Status: the current browser-speech Voice Mode keeps working. We only swap the
> frontend over **after** the Pipecat server is deployed and reachable.

## The free stack

| Piece | Choice | Cost |
|-------|--------|------|
| Orchestration | **Pipecat** (open source) | Free |
| Transport (browser ↔ server) | **WebSocket** (WSS over TCP) — works on any free PaaS | Free |
| STT | **Whisper** (local, `base`/`small` model) | Free |
| LLM | **Google Gemini** (free tier — already used by `/api/gemini`) | Free tier |
| TTS | **Piper** (local, open source) | Free |

There are **no per-minute fees** for this use case — those only apply to
Pipecat Cloud and telephony (SIP/PSTN), which we are not using.

### Why WebSocket transport (not SmallWebRTC) on a free host
SmallWebRTC is lowest-latency but needs **UDP + ICE/NAT traversal**, which most
free HTTP PaaS (Render, Cloud Run) block — it would need a TURN server. The
**WebSocket transport runs over plain WSS (TCP)** and works on any free host.
(If we later move to a VM/Fly.io with UDP, we can switch to SmallWebRTC for
lower latency.)

## Server: scaffold with the official CLI (gets current, correct code)

Do this locally (needs Python 3.10+):

```bash
# 1. Install the Pipecat CLI
uv tool install pipecat-ai-cli      # or: pipx install pipecat-ai-cli

# 2. Scaffold a quickstart bot (generates a working bot.py for the current version)
pipecat init

# 3. In the generated project, install the services we need:
uv add "pipecat-ai[whisper,google,piper,silero,websocket]"
```

Then edit the generated `bot.py` so the pipeline uses:
- **WebSocket server transport** (instead of SmallWebRTC),
- **Whisper STT** (local model, e.g. `base.en`),
- **Google Gemini LLM** (`gemini-2.5-flash`),
- **Piper TTS** (point it at a running Piper voice, or the bundled Piper server),
- **Silero VAD** for turn detection.

Use the **same system prompt** we already build on the client
(`src/lib/prompt.js`) so the advisor stays grounded in the user's
goals/ideas/profile. Easiest: have the client send that system prompt to the
bot on connect.

### Environment variables (server)
```
GEMINI_API_KEY=...        # same key as Vercel's /api/gemini
# Whisper + Piper run locally — no keys.
```

## Deploy (free tier)

Recommended: **Render** (free web service) or **Fly.io** (free allowance, also
supports UDP if we later want SmallWebRTC).

1. Add a `Dockerfile` to the bot project (the CLI scaffold includes one, or use
   `python:3.11-slim`, `pip install`, expose the WS port, `CMD python bot.py`).
2. Push the bot to its **own repo** (keep it separate from this Vercel app).
3. Create the service on Render/Fly, set `GEMINI_API_KEY`, deploy.
4. Note the public **WSS URL** (e.g. `wss://cortex-bot.onrender.com`).

> Free-tier reality: small free CPUs make real-time Whisper laggy and free
> services **sleep when idle** (first connection after idle is slow). Use the
> Whisper `base.en`/`small.en` model for speed. A ~$5/mo instance removes the
> lag later if desired.

## Frontend (this app) — done after the server is live

Install the Pipecat web client:
```bash
npm i @pipecat-ai/client-js @pipecat-ai/client-react @pipecat-ai/websocket-transport
```

Then rewire `src/components/VoiceOverlay.jsx`:
- Replace `useVoiceRecognition` with the Pipecat client (`PipecatClient` +
  `WebSocketTransport`) pointing at the bot's WSS URL
  (`VITE_PIPECAT_URL` env var).
- Keep the gold orb: drive its level from the client's audio track / RTVI
  `audio-level` events.
- The bot streams TTS audio back, so the browser **plays the advisor's voice**
  from the bot instead of using local `speechSynthesis`.
- Keep the Mute button (mute the client's mic track).

`/api/gemini` and `/api/speechmatics-token` on Vercel become unused for voice
(can stay for the text Advisor, or be removed later).

## Rollout order
1. ✅ Keep current browser voice working (no changes yet).
2. Scaffold + run the bot locally; confirm it transcribes + answers over WS.
3. Deploy the bot to a free host; get the WSS URL.
4. Wire the frontend to the bot behind `VITE_PIPECAT_URL`; ship.
5. (Optional) Move to a VM + SmallWebRTC for lower latency.

## Honest caveats
- Requires an **always-on Python server** — cannot run on Vercel.
- Free hosting = **cold starts + real-time lag** with local Whisper; acceptable
  for testing, upgrade to a cheap VM for smoothness.
- This is a multi-step build; the browser-speech fallback stays until step 4.
