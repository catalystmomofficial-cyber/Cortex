# Premium voice with VoxCPM (free, self-hostable)

Cortex speaks the advisor's replies. By default it uses the **free browser
voice**. To use **VoxCPM** (open Apache-2.0 TTS, ElevenLabs-class, multilingual
incl. English + Tagalog, voice cloning), run it on a GPU endpoint and point
Cortex at it. The browser voice stays as automatic fallback.

## Recommended host: Modal (free for personal/demo use)

Modal gives free monthly credits and **scales to zero** (idle = $0), so for
just you + demos it's effectively free. You own the deploy, so it's reusable
across projects and easy to scale later.

```bash
pip install modal
modal token new
modal secret create voxcpm VOXCPM_TOKEN=<a-long-random-string>
modal deploy server/voxcpm_modal.py     # prints an https://...modal.run URL
```

## Wire it into Cortex

In Vercel → Project → Settings → Environment Variables:

```
VOXCPM_URL   = <the .modal.run URL from the deploy>
VOXCPM_TOKEN = <the same random string>
VITE_VOXCPM  = 1
```

Redeploy. Now the advisor (chat + Voice Mode) speaks with VoxCPM. Unset
`VITE_VOXCPM` (or `VOXCPM_URL`) to go back to the free browser voice instantly.

## The contract (host-agnostic)

`api/tts.js` POSTs JSON to `VOXCPM_URL`:

```json
{ "text": "…", "language": "en", "token": "<VOXCPM_TOKEN>" }
```

…and expects **audio bytes back** (`audio/wav`). Any host that honors this
contract works — Modal, a self-hosted FastAPI box, Replicate-via-wrapper, etc.
So you can start on Modal and self-host later without changing Cortex.

## Notes / caveats
- First request after idle has a **cold start** (model load); subsequent ones
  are fast while warm (`scaledown_window`).
- The Modal script is a starting point — Modal's API evolves; if
  `fastapi_endpoint` is unknown on your version, use `web_endpoint`.
- Voice cloning: VoxCPM's `generate(reference_wav_path=…)` can clone a voice —
  add a reference clip in `server/voxcpm_modal.py` later if you want a custom
  brand voice.
