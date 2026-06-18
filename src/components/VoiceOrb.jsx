import { useEffect, useRef } from 'react'

// A luxury gold "particle sphere" rendered on canvas: points distributed on a
// sphere (fibonacci), gently rotating, with a flowing surface displacement.
// The swell is driven by `levelRef` (0..1) so the orb visibly reacts while the
// user speaks AND while the advisor is responding — like ChatGPT/Gemini voice.
export default function VoiceOrb({ levelRef, size = 260 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    function resize() {
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
    }
    resize()

    // Fibonacci sphere — even point distribution.
    const N = 1500
    const golden = Math.PI * (3 - Math.sqrt(5))
    const pts = []
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const theta = golden * i
      pts.push([Math.cos(theta) * r, y, Math.sin(theta) * r])
    }

    let raf
    let t = 0
    let amp = 0.18

    function frame() {
      t += 0.01
      const level = (levelRef && levelRef.current) || 0
      const target = 0.18 + level * 0.95
      amp += (target - amp) * 0.12

      const w = canvas.width
      const h = canvas.height
      const cx = w / 2
      const cy = h / 2
      const R = Math.min(w, h) * 0.3

      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'

      const spin = 0.45 + level * 0.5
      const rotY = t * spin
      const rotX = Math.sin(t * 0.25) * 0.35
      const cY = Math.cos(rotY)
      const sY = Math.sin(rotY)
      const cX = Math.cos(rotX)
      const sX = Math.sin(rotX)

      for (let i = 0; i < N; i++) {
        let [x, y, z] = pts[i]

        const n =
          Math.sin(x * 3.2 + t * 1.6) * Math.cos(y * 3.0 - t * 1.2) * Math.sin(z * 3.4 + t)
        const disp = 1 + n * 0.16 * amp

        x *= disp
        y *= disp
        z *= disp

        const x1 = x * cY - z * sY
        const z1 = x * sY + z * cY
        const y1 = y * cX - z1 * sX
        const z2 = y * sX + z1 * cX

        const persp = 1 / (2.1 - z2 * 0.55)
        const sx = cx + x1 * R * persp * 1.45
        const sy = cy + y1 * R * persp * 1.45

        const depth = (z2 + 1) / 2
        const alpha = 0.06 + depth * depth * 0.9
        const radius = (0.4 + depth * 1.7) * dpr

        const rr = Math.round(190 + depth * 60)
        const gg = Math.round(150 + depth * 70)
        const bb = Math.round(70 + depth * 50)

        ctx.beginPath()
        ctx.arc(sx, sy, radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rr},${gg},${bb},${alpha})`
        ctx.fill()
      }

      ctx.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(frame)
    }

    frame()
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [levelRef])

  return <canvas ref={canvasRef} className="voice-orb-canvas" style={{ width: size, height: size }} />
}
