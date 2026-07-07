# Kokoro TTS on Modal — the "Jessica" voice you picked in Voicebox, hosted.
#
# Kokoro is tiny (82M params, Apache-2.0) and CPU-fast, so unlike VoxCPM there's
# no multi-minute GPU cold start and no GPU bill — idle = $0 (scale-to-zero).
# It honors the SAME contract as voxcpm_modal.py ({text, language, token} ->
# audio/wav bytes), so Cortex needs ZERO code changes to switch: just point
# VOXCPM_URL at this deploy's URL. VOXCPM_TOKEN and VITE_VOXCPM stay the same.
#
# Deploy:
#   modal deploy server/kokoro_modal.py     # prints an https://...modal.run URL
# Then in Vercel set:
#   VOXCPM_URL = <that .modal.run URL>       # (VOXCPM_TOKEN + VITE_VOXCPM=1 unchanged)
# and redeploy Cortex.

import io
import os

import modal

app = modal.App("kokoro-tts")

# espeak-ng is Kokoro's fallback phonemizer for out-of-dictionary words.
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("espeak-ng")
    .pip_install("kokoro>=0.9.2", "soundfile", "numpy", "fastapi[standard]")
)

VOICE = "af_jessica"  # the "Jessica" American-English voice from Voicebox
LANG = "a"            # 'a' = American English (matches the af_ voices)
SAMPLE_RATE = 24000   # Kokoro outputs 24 kHz


@app.cls(
    image=image,
    scaledown_window=300,  # stay warm 5 min after a request, then scale to zero
    secrets=[modal.Secret.from_name("voxcpm")],  # reuse the existing token secret
)
class TTS:
    @modal.enter()
    def load(self):
        from kokoro import KPipeline

        self.pipeline = KPipeline(lang_code=LANG)

    @modal.fastapi_endpoint(method="POST")
    def generate(self, item: dict):
        import numpy as np
        import soundfile as sf
        from fastapi import Response

        token = os.environ.get("VOXCPM_TOKEN")
        if token and item.get("token") != token:
            return Response(status_code=401)

        text = (item.get("text") or "").strip()
        if not text:
            return Response(status_code=400)

        # Kokoro streams sentence-sized chunks; stitch them into one clip.
        chunks = [np.asarray(audio) for _, _, audio in self.pipeline(text, voice=VOICE)]
        if not chunks:
            return Response(status_code=400)
        wav = np.concatenate(chunks)

        # 16-bit PCM WAV — the one format every browser's <audio> can play.
        # (Kokoro emits float32; a float WAV is silent in Safari / HTMLAudio.)
        buf = io.BytesIO()
        sf.write(buf, wav, SAMPLE_RATE, format="WAV", subtype="PCM_16")
        return Response(content=buf.getvalue(), media_type="audio/wav")
