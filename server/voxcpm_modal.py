# VoxCPM text-to-speech on Modal — free-tier friendly (scale-to-zero GPU).
#
# Deploy once, get an HTTPS endpoint, point Cortex's VOXCPM_URL at it. Idle =
# $0 (scales to zero); only runs (and bills) while synthesizing. Apache-2.0
# model, multilingual incl. English + Tagalog. Reusable across your projects.
#
# Setup:
#   pip install modal
#   modal token new
#   modal secret create voxcpm VOXCPM_TOKEN=<a-long-random-string>
#   modal deploy server/voxcpm_modal.py
# Then set in Vercel: VOXCPM_URL=<the .modal.run URL>, VOXCPM_TOKEN=<same>,
# and VITE_VOXCPM=1.
#
# Note: Modal's API evolves — if `fastapi_endpoint` is unknown on your version,
# use `web_endpoint` instead (same args).

import io
import os

import modal

app = modal.App("voxcpm-tts")

image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "voxcpm", "soundfile", "fastapi[standard]", "huggingface_hub"
)

MODEL_ID = "openbmb/VoxCPM-0.5B"  # small + fast (1.6 GB) → quick cold start


@app.cls(
    gpu="A10G",
    image=image,
    scaledown_window=120,  # stay warm 2 min after a request, then scale to zero
    secrets=[modal.Secret.from_name("voxcpm")],
)
class TTS:
    @modal.enter()
    def load(self):
        from voxcpm import VoxCPM

        self.model = VoxCPM.from_pretrained(MODEL_ID, load_denoiser=False)

    @modal.fastapi_endpoint(method="POST")
    def generate(self, item: dict):
        import soundfile as sf
        from fastapi import Response

        token = os.environ.get("VOXCPM_TOKEN")
        if token and item.get("token") != token:
            return Response(status_code=401)

        text = (item.get("text") or "").strip()
        if not text:
            return Response(status_code=400)

        wav = self.model.generate(text=text, cfg_value=2.0, inference_timesteps=10)
        buf = io.BytesIO()
        sf.write(buf, wav, self.model.tts_model.sample_rate, format="WAV")
        return Response(content=buf.getvalue(), media_type="audio/wav")
