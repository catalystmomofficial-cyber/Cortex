# Cortex voice server on Modal — NVIDIA Magpie TTS first, Kokoro (Jessica) as an
# instant fallback that can never hang or go silent.
#
# Kokoro is loaded eagerly at container start (it's tiny), so the fallback is
# always ready. Magpie is attempted first but capped at a few seconds — if it's
# slow, errors, or is misconfigured, Jessica speaks immediately instead. Every
# Magpie failure is logged so we can see why. Same contract/URL as always:
# {text, language, token} -> audio/wav bytes.
#
# Setup (NVIDIA key stays in a Modal secret, not the repo):
#   python3 -m modal secret create nvidia NVIDIA_API_KEY=<key> --force
#   python3 -m modal deploy server/kokoro_modal.py

import concurrent.futures
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

# NVIDIA Magpie TTS Multilingual on build.nvidia.com (hosted NIM, gRPC).
MAGPIE_FUNCTION_ID = "877104f7-e885-42b9-8de8-f6e4c6303969"
MAGPIE_VOICE = "Magpie-Multilingual.EN-US.Sofia"  # warm female EN voice
MAGPIE_RATE = 44100
MAGPIE_TIMEOUT_S = 6  # never let Magpie hang the reply — fall back to Jessica

# Kokoro fallback — "Jessica", loaded eagerly so it's always instant.
KOKORO_VOICE = "af_jessica"
KOKORO_LANG = "a"  # 'a' = American English (matches the af_ voices)
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
    def load(self):
        from kokoro import KPipeline

        # Eager — the fallback must be ready the instant Magpie misses.
        self.kokoro = KPipeline(lang_code=KOKORO_LANG)

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

    def _magpie_safe(self, text):
        """Try Magpie, but never hang and never crash the request."""
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                return ex.submit(self._magpie, text).result(timeout=MAGPIE_TIMEOUT_S)
        except Exception as e:  # timeout, auth, bad voice name, network — anything
            print("Magpie TTS failed, using Kokoro fallback:", repr(e))
            return None

    def _kokoro(self, text):
        import numpy as np
        import soundfile as sf

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
            wav = self._magpie_safe(text)
        if wav is None:
            wav = self._kokoro(text)
        if wav is None:
            return Response(status_code=500)
        return Response(content=wav, media_type="audio/wav")
