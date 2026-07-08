# Cortex voice server on Modal — Kokoro (Jessica), fast and reliable.
#
# Kokoro is tiny (82M, Apache-2.0), loaded eagerly at container start so warm
# replies come back in ~1-2s. Scale-to-zero keeps idle cost at $0. Contract:
# {text, language, token} -> 16-bit PCM audio/wav bytes (the format every
# browser's <audio>/AudioContext can play).
#
# (NVIDIA Magpie was tried as the primary voice but its gRPC endpoint hung the
# request → 504s → browser-voice fallback. Pulled out until it can be verified
# end-to-end. See git history for that attempt.)
#
# Deploy:
#   python3 -m modal deploy server/kokoro_modal.py

import io
import os

import modal

app = modal.App("kokoro-tts")

VOICE = "af_jessica"  # "Jessica" — warm American-English female
LANG = "a"            # 'a' = American English (matches the af_ voices)
RATE = 24000          # Kokoro outputs 24 kHz


def _bake_model():
    # Runs at image BUILD time so the Kokoro model + voice are baked into the
    # image — cold starts then load from local disk (~8s) instead of downloading
    # (~25s), which was making the first reply miss the client timeout.
    from kokoro import KPipeline

    list(KPipeline(lang_code=LANG)("warm up", voice=VOICE))


# espeak-ng is Kokoro's fallback phonemizer for out-of-dictionary words.
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("espeak-ng")
    .pip_install("kokoro>=0.9.2", "soundfile", "numpy", "fastapi[standard]")
    .run_function(_bake_model)
)


@app.cls(
    image=image,
    scaledown_window=1800,  # stay warm 30 min after a request, then scale to zero
    secrets=[modal.Secret.from_name("voxcpm")],  # VOXCPM_TOKEN (request auth)
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

        chunks = [np.asarray(a) for _, _, a in self.pipeline(text, voice=VOICE)]
        if not chunks:
            return Response(status_code=400)

        buf = io.BytesIO()
        sf.write(buf, np.concatenate(chunks), RATE, format="WAV", subtype="PCM_16")
        return Response(content=buf.getvalue(), media_type="audio/wav")
