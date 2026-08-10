import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { STATE_DIR } from "./state.js"

// On-the-fly, fully deterministic upload fixtures — no external assets, no
// network, no image libraries. Same seed => byte-identical files on every
// machine and every run, which keeps the recipe reproducible. (For real-photo
// material there is scripts/fetch-cc-assets.sh, which pulls a couple of
// Creative-Commons files from Wikimedia Commons with recorded checksums — but
// the default fixtures are these generated ones.)

// ─── Deterministic PRNG ──────────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── PNG encoder (pure: IHDR/IDAT/IEND + CRC32 + node:zlib) ──────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([len, typeAndData, crc])
}

function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  // compression 0, filter 0, interlace 0

  // Raw scanlines, each prefixed with filter byte 0 (None).
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4)
    raw[rowStart] = 0
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ])
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return [f(0), f(8), f(4)]
}

/**
 * A team-logo style identicon: seeded gradient background + mirrored 5x5
 * block pattern in an accent color. Deterministic per seed.
 */
export function generateLogoPng(seed: number, size = 96): Buffer {
  const rand = mulberry32(seed)
  const hue = rand()
  const [br, bg, bb] = hslToRgb(hue, 0.45, 0.22)
  const [br2, bg2, bb2] = hslToRgb((hue + 0.08) % 1, 0.5, 0.38)
  const [ar, ag, ab] = hslToRgb((hue + 0.5) % 1, 0.7, 0.62)

  // 5x5 grid, left half random, mirrored to the right.
  const cells: boolean[][] = []
  for (let y = 0; y < 5; y++) {
    const row: boolean[] = []
    for (let x = 0; x < 3; x++) row.push(rand() < 0.55)
    cells.push([row[0]!, row[1]!, row[2]!, row[1]!, row[0]!])
  }

  const margin = Math.floor(size / 8)
  const cell = Math.floor((size - 2 * margin) / 5)
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    const t = y / size
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      let r = Math.round(br + (br2 - br) * t)
      let g = Math.round(bg + (bg2 - bg) * t)
      let b = Math.round(bb + (bb2 - bb) * t)
      const cx = Math.floor((x - margin) / cell)
      const cy = Math.floor((y - margin) / cell)
      if (cx >= 0 && cx < 5 && cy >= 0 && cy < 5 && cells[cy]![cx]) {
        r = ar
        g = ag
        b = ab
      }
      rgba[i] = r
      rgba[i + 1] = g
      rgba[i + 2] = b
      rgba[i + 3] = 255
    }
  }
  return encodePng(size, size, rgba)
}

export function pngDataUri(png: Buffer): string {
  return `data:image/png;base64,${png.toString("base64")}`
}

// ─── SVG poster ──────────────────────────────────────────────────────────────

export function generatePosterSvg(opts: {
  title: string
  subtitle: string
  seed: number
}): string {
  const rand = mulberry32(opts.seed)
  const hue = Math.round(rand() * 360)
  const circles = Array.from({ length: 14 }, () => {
    const cx = Math.round(rand() * 800)
    const cy = Math.round(rand() * 400)
    const r = Math.round(20 + rand() * 90)
    const o = (0.06 + rand() * 0.12).toFixed(2)
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="hsl(${hue} 70% 60% / ${o})"/>`
  }).join("\n    ")
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <rect width="800" height="450" fill="hsl(${hue} 45% 14%)"/>
  <g>
    ${circles}
  </g>
  <text x="48" y="220" font-family="sans-serif" font-size="42" font-weight="700" fill="#fff">${opts.title}</text>
  <text x="48" y="264" font-family="sans-serif" font-size="20" fill="hsl(${hue} 70% 75%)">${opts.subtitle}</text>
</svg>
`
}

// ─── Minimal single-page PDF (hand-assembled xref) ───────────────────────────

function pdfEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
}

export function generatePdfReport(title: string, lines: string[]): Buffer {
  const content = [
    "BT",
    "/F1 18 Tf",
    `50 790 Td (${pdfEscape(title)}) Tj`,
    "/F1 11 Tf",
    ...lines.map((l, i) => `0 ${i === 0 ? -30 : -16} Td (${pdfEscape(l)}) Tj`),
    "ET",
  ].join("\n")

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]

  let body = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xrefStart = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return Buffer.from(body, "latin1")
}

// ─── CSV sample data ─────────────────────────────────────────────────────────

export function generateCsv(seed: number, rows = 48): string {
  const rand = mulberry32(seed)
  const out = ["timestamp,sensor_id,temperature_c,humidity_pct,co2_ppm"]
  for (let i = 0; i < rows; i++) {
    // Fixed base timestamp — wall-clock independence keeps runs byte-identical.
    const ts = new Date(Date.UTC(2027, 5, 12, 8, 0, 0) + i * 15 * 60_000).toISOString()
    out.push(
      `${ts},S-${(i % 4) + 1},${(17 + rand() * 9).toFixed(2)},${(35 + rand() * 30).toFixed(1)},${Math.round(400 + rand() * 350)}`,
    )
  }
  return out.join("\n") + "\n"
}

// ─── Submission asset bundle ─────────────────────────────────────────────────

export interface GeneratedAsset {
  name: string
  path: string
  bytes: number
}

/**
 * Write a realistic submission bundle (logo PNG, poster SVG, report PDF,
 * dataset CSV, README) for a team into .state/uploads/<slug>/. Deterministic
 * per (slug, seed). Returns the manifest.
 */
export function generateSubmissionAssets(
  slug: string,
  seed: number,
  meta: { team: string; project: string; hackathon: string },
): { dir: string; assets: GeneratedAsset[] } {
  const dir = path.join(STATE_DIR, "uploads", slug)
  fs.mkdirSync(dir, { recursive: true })

  const files: Record<string, Buffer | string> = {
    "logo.png": generateLogoPng(seed),
    "poster.svg": generatePosterSvg({
      title: meta.project,
      subtitle: `${meta.team} — ${meta.hackathon}`,
      seed: seed + 1,
    }),
    "final-report.pdf": generatePdfReport(`${meta.project} — Final Report`, [
      `Team: ${meta.team}`,
      `Event: ${meta.hackathon}`,
      "",
      "1. Problem statement and motivation",
      "2. Data sources and preprocessing pipeline",
      "3. Model architecture and training setup",
      "4. Results, evaluation and limitations",
      "5. Reproducibility: see data-sample.csv and the repository README",
    ]),
    "data-sample.csv": generateCsv(seed + 2),
    "README.md": [
      `# ${meta.project}`,
      "",
      `Submission by **${meta.team}** for ${meta.hackathon}.`,
      "",
      "## Contents",
      "",
      "| File | Description |",
      "| --- | --- |",
      "| logo.png | Team logo (generated) |",
      "| poster.svg | Presentation poster |",
      "| final-report.pdf | Final report |",
      "| data-sample.csv | Sample of the sensor dataset |",
      "",
      "_All assets are deterministic test fixtures generated by the e2e suite._",
      "",
    ].join("\n"),
  }

  const assets: GeneratedAsset[] = []
  for (const [name, data] of Object.entries(files)) {
    const p = path.join(dir, name)
    fs.writeFileSync(p, data)
    assets.push({ name, path: p, bytes: fs.statSync(p).size })
  }
  return { dir, assets }
}
