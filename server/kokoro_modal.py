# Cortex voice server on Modal — NVIDIA Magpie TTS first, Kokoro fallback.
#
# Primary: NVIDIA's hosted Magpie TTS Multilingual (free API credits from
# build.nvidia.com; gRPC-only, which is why this lives here in Python and not
# in the Vercel Node function). Fallback: local Kokoro (af_heart), lazy-loaded
# on first use so cold starts stay at a few seconds instead of a model load.
# Same contract as always ({text, language, token} -> audio/wav bytes), same
# app name, same URL — no Vercel changes needed.
#
# One-time setup (the NVIDIA key stays out of the repo, in a Modal secret):
#   python3 -m modal secret create nvidia NVIDIA_API_KEY=<your key from build.nvidia.com>
# Deploy:
#   python3 -m modal deploy server/kokoro_modal.py

import io
import os
import wave

import modal

app = modal.App("kokoro-tts")

# espeak-ng is Kokoro's fallback phonemizer for out-of-dictionary words.
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("espeak-ng")
    .pip_install(
        "kokoro>=0.9.2", "soundfile", "numpy", "fastapi[standard]",
        "nvidia-riva-client",
    )
)

# NVIDIA Magpie TTS Multilingual on build.nvidia.com (hosted NIM).
MAGPIE_FUNCTION_ID = "877104f7-e885-42b9-8de8-f6e4c6303969"
MAGPIE_VOICE = "Magpie-Multilingual.EN-US.Sofia"  # warm female EN voice
MAGPIE_RATE = 44100

# Kokoro fallback.
KOKORO_VOICE = "af_heart"  # Kokoro's top-graded voice — warm, rich female
KOKORO_LANG = "a"          # 'a' = American English (matches the af_ voices)
KOKORO_RATE = 24000


@app.cls(
    image=image,
    scaledown_window=1800,  # stay warm 30 min after a request, then scale to zero
    secrets=[
        modal.Secret.from_name("voxcpm"),   # VOXCPM_TOKEN (request auth)
        modal.Secret.from_name("nvidia"),   # NVIDIA_API_KEY (Magpie TTS)
    ],
)
class TTS:
    @modal.enter()
    def setup(self):
        self.kokoro = None  # lazy — only loaded if NVIDIA fails

    def _magpie(self, text):
        import riva.client

        auth = riva.client.Auth(
            None,
            use_ssl=True,
            uri="grpc.nvcf.nvidia.com:443",
            metadata_args=[
                ["function-id", MAGPIE_FUNCTION_ID],
                ["authorization", "Bearer " + os.environ["NVIDIA_API_KEY"]],
            ],
        )
        svc = riva.client.SpeechSynthesisService(auth)
        resp = svc.synthesize(
            text=text,
            voice_name=MAGPIE_VOICE,
            language_code="en-US",
            encoding=riva.client.AudioEncoding.LINEAR_PCM,
            sample_rate_hz=MAGPIE_RATE,
        )
        # Riva returns raw 16-bit PCM; wrap it in a WAV header.
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(MAGPIE_RATE)
            w.writeframes(resp.audio)
        return buf.getvalue()

    def _kokoro_speak(self, text):
        import numpy as np
        import soundfile as sf

        if self.kokoro is None:
            from kokoro import KPipeline

            self.kokoro = KPipeline(lang_code=KOKORO_LANG)
        chunks = [np.asarray(a) for _, _, a in self.kokoro(text, voice=KOKORO_VOICE)]
        if not chunks:
            return None
        buf = io.BytesIO()
        # 16-bit PCM WAV — the one format every browser's <audio> can play.
        sf.write(buf, np.concatenate(chunks), KOKORO_RATE, format="WAV", subtype="PCM_16")
        return buf.getvalue()

    @modal.fastapi_endpoint(method="POST")
    def generate(self, item: dict):
        from fastapi import Response

        token = os.environ.get("VOXCPM_TOKEN")
        if token and item.get("token") != token:
            return Response(status_code=401)

        text = (item.get("text") or "").strip()
        if not text:
            return Response(status_code=400)

        wav = None
        if os.environ.get("NVIDIA_API_KEY"):
            try:
                wav = self._magpie(text)
            except Exception:
                wav = None  # NVIDIA down/limited → Kokoro takes over
        if wav is None:
            wav = self._kokoro_speak(text)
        if wav is None:
            return Response(status_code=500)
        return Response(content=wav, media_type="audio/wav")
