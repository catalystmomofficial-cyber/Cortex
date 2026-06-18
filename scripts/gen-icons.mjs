// Generates the Cortex PWA icons (a glowing amber "orb" on a near-black field)
// without any design tooling. Run with: node scripts/gen-icons.mjs
import { PNG } from 'pngjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(__dirname, '..', 'public')
mkdirSync(outDir, { recursive: true })

// Palette
const BG = [10, 8, 5] // #0A0805
const ORB_CORE = [255, 214, 153] // warm highlight
const ORB_MID = [245, 166, 35] // amber
const ORB_EDGE = [180, 90, 12] // deep amber

function lerp(a, b, t) {
  return a.map((c, i) => Math.round(c + (b[i] - c) * t))
}

function makeIcon(size) {
  const png = new PNG({ width: size, height: size })
  const cx = size / 2
  const cy = size / 2
  const orbR = size * 0.34
  const glowR = size * 0.48

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)

      let color = BG
      let alpha = 255

      if (dist <= orbR) {
        // Inside the orb: core -> mid -> edge gradient
        const t = dist / orbR
        color = t < 0.5 ? lerp(ORB_CORE, ORB_MID, t / 0.5) : lerp(ORB_MID, ORB_EDGE, (t - 0.5) / 0.5)
      } else if (dist <= glowR) {
        // Soft glow halo fading into the background
        const t = (dist - orbR) / (glowR - orbR)
        color = lerp(ORB_EDGE, BG, t)
      }

      png.data[idx] = color[0]
      png.data[idx + 1] = color[1]
      png.data[idx + 2] = color[2]
      png.data[idx + 3] = alpha
    }
  }

  const buffer = PNG.sync.write(png)
  writeFileSync(resolve(outDir, `icon-${size}.png`), buffer)
  console.log(`wrote icon-${size}.png`)
}

makeIcon(192)
makeIcon(512)
