#!/usr/bin/env node
// Bundle every markdown file under docs/ into ONE self-contained HTML:
// images re-encoded to webp and inlined as data URIs, mermaid diagrams
// pre-rendered to inline SVG, cross-document links rewritten to anchors.
//
// Nothing is loaded at view time — no CDN, no fonts, no JS required to read
// it. Hand the file to anyone; it works from a USB stick or an email
// attachment, and prints to PDF cleanly.
//
// Usage: node scripts/build.mjs [--out FILE] [--no-mermaid] [--quality N]

import fs from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { execSync } from "node:child_process"
import { marked } from "marked"
import sharp from "sharp"

const SKILL = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const ROOT = path.resolve(SKILL, "..", "..", "..")
const DOCS = path.join(ROOT, "docs")

const args = process.argv.slice(2)
const opt = (flag, def) => {
  const i = args.indexOf(flag)
  return i === -1 ? def : args[i + 1]
}
const OUT = path.resolve(opt("--out", path.join(SKILL, "out", "hackagon-docs.html")))
const QUALITY = Number(opt("--quality", 78))
const MAX_WIDTH = Number(opt("--max-width", 1400))
const NO_MERMAID = args.includes("--no-mermaid")

// Reading order. Anything in docs/ not listed here is appended alphabetically,
// so a new doc is never silently dropped.
const ORDER = [
  "README.md",
  "architecture.md",
  "architecture-model.md",
  "getting-started.md",
  "user-flows.md",
  "lifecycle.md",
  "backend/services.md",
  "backend/data-model.md",
  "backend/rbac.md",
  "frontend/routes-and-auth.md",
  "frontend/grpc-clients.md",
  "testing.md",
  "requirements.md",
  "roadmap.md",
  "infrastructure.md",
  "glossary.md",
  "TODO.md",
]

const slug = (s) =>
  s.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60)
const docId = (rel) => "doc-" + rel.replace(/\.md$/, "").replace(/[/\\]/g, "-").toLowerCase()
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

async function listDocs() {
  const found = []
  const walk = async (dir) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.name.endsWith(".md")) found.push(path.relative(DOCS, p).replace(/\\/g, "/"))
    }
  }
  await walk(DOCS)
  const ordered = ORDER.filter((f) => found.includes(f))
  const rest = found.filter((f) => !ORDER.includes(f)).sort()
  if (rest.length) console.log(`   (not in ORDER, appended: ${rest.join(", ")})`)
  return [...ordered, ...rest]
}

// ── images → webp data URIs ─────────────────────────────────────────────────
const imgCache = new Map()
let imgBytesIn = 0, imgBytesOut = 0, imgCount = 0, imgMissing = 0

async function inlineImage(src, fromDir) {
  if (/^(https?:|data:)/.test(src)) return src // leave remote/inline alone
  const abs = path.resolve(fromDir, src.split("#")[0].split("?")[0])
  if (imgCache.has(abs)) return imgCache.get(abs)
  if (!existsSync(abs)) {
    console.warn(`   ! missing image: ${path.relative(ROOT, abs)}`)
    imgMissing++
    return src
  }
  const input = await fs.readFile(abs)
  imgBytesIn += input.length
  let out, mime
  if (/\.svg$/i.test(abs)) {
    out = input // vector already; re-encoding would rasterize it
    mime = "image/svg+xml"
  } else {
    out = await sharp(input)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer()
    mime = "image/webp"
  }
  imgBytesOut += out.length
  imgCount++
  const uri = `data:${mime};base64,${out.toString("base64")}`
  imgCache.set(abs, uri)
  return uri
}

async function inlineAllImages(html, fromDir) {
  const srcs = [...html.matchAll(/<img\b[^>]*?\ssrc=["']([^"']+)["']/gi)].map((m) => m[1])
  for (const src of new Set(srcs)) {
    const uri = await inlineImage(src, fromDir)
    if (uri !== src) html = html.split(`src="${src}"`).join(`src="${uri}"`)
                                .split(`src='${src}'`).join(`src="${uri}"`)
  }
  return html
}

// ── mermaid theming ─────────────────────────────────────────────────────────
// Same palette as the hand-laid C4 SVGs (dev/scripts/render-diagrams.mjs), so
// the two diagram families read as one system. Mermaid renders at BUILD time
// with fixed colours, so each block is rendered twice — light and dark — and
// the page shows whichever matches the reader. Four diagram types are in use
// (flowchart, sequence, ER, state); the variables below span all of them.
const FONT = 'system-ui,-apple-system,"Segoe UI",sans-serif'
const THEMES = {
  light: {
    background: "#faf9f6", primaryColor: "#dbe7f4", primaryTextColor: "#17171a",
    primaryBorderColor: "#8fb2d6", secondaryColor: "#f3ece0", secondaryBorderColor: "#d3bf9e",
    tertiaryColor: "#d9ece3", tertiaryBorderColor: "#84b9a2",
    lineColor: "#7b7972", textColor: "#17171a", mainBkg: "#dbe7f4", nodeBorder: "#8fb2d6",
    clusterBkg: "#f2f1ec", clusterBorder: "#b6b4aa", titleColor: "#17171a",
    edgeLabelBackground: "#faf9f6", labelBoxBkgColor: "#dbe7f4", labelBoxBorderColor: "#8fb2d6",
    actorBkg: "#2c4a63", actorBorder: "#22394c", actorTextColor: "#ffffff",
    signalColor: "#4c4b48", signalTextColor: "#17171a",
    loopTextColor: "#17171a", noteBkgColor: "#f3ece0", noteBorderColor: "#d3bf9e",
    noteTextColor: "#17171a", activationBkgColor: "#dbe7f4", activationBorderColor: "#8fb2d6",
    sequenceNumberColor: "#ffffff",
    attributeBackgroundColorOdd: "#faf9f6", attributeBackgroundColorEven: "#f2f1ec",
    fontFamily: FONT, fontSize: "14px",
  },
  dark: {
    darkMode: true,
    background: "#121213", primaryColor: "#1e2f42", primaryTextColor: "#f2f1ec",
    primaryBorderColor: "#3f6187", secondaryColor: "#2c2519", secondaryBorderColor: "#5a4a2c",
    tertiaryColor: "#17322a", tertiaryBorderColor: "#3d6b58",
    lineColor: "#8d8c85", textColor: "#f2f1ec", mainBkg: "#1e2f42", nodeBorder: "#3f6187",
    clusterBkg: "#1b1c1a", clusterBorder: "#4a4b47", titleColor: "#f2f1ec",
    edgeLabelBackground: "#121213", labelBoxBkgColor: "#1e2f42", labelBoxBorderColor: "#3f6187",
    actorBkg: "#40607d", actorBorder: "#5a7c9c", actorTextColor: "#ffffff",
    signalColor: "#c6c5be", signalTextColor: "#f2f1ec",
    loopTextColor: "#f2f1ec", noteBkgColor: "#2c2519", noteBorderColor: "#5a4a2c",
    noteTextColor: "#f2f1ec", activationBkgColor: "#1e2f42", activationBorderColor: "#3f6187",
    sequenceNumberColor: "#ffffff",
    attributeBackgroundColorOdd: "#121213", attributeBackgroundColorEven: "#1b1c1a",
    fontFamily: FONT, fontSize: "14px",
  },
}

// ── mermaid → inline SVG (rendered once in a headless browser) ──────────────
async function renderMermaid(blocks) {
  if (!blocks.length || NO_MERMAID) return new Map()
  let chromium, firefox
  try { ({ chromium, firefox } = await import("playwright")) } catch {
    console.warn("   ! playwright not installed — mermaid blocks stay as code")
    return new Map()
  }
  const mermaidJs = path.join(SKILL, "node_modules", "mermaid", "dist", "mermaid.min.js")
  if (!existsSync(mermaidJs)) {
    console.warn("   ! mermaid package not found — blocks stay as code")
    return new Map()
  }
  let browser
  for (const launcher of [chromium, firefox]) {
    try { browser = await launcher.launch(); break } catch { /* try the next */ }
  }
  if (!browser) {
    console.warn("   ! no browser available to render mermaid — blocks stay as code")
    return new Map()
  }
  const page = await browser.newPage()
  await page.setContent("<!doctype html><body><div id='s'></div>")
  await page.addScriptTag({ path: mermaidJs })

  const out = new Map()
  for (const mode of ["light", "dark"]) {
    await page.evaluate((vars) => window.mermaid.initialize({
      startOnLoad: false, theme: "base", themeVariables: vars,
      flowchart: { curve: "basis", padding: 14 },
      sequence: { actorMargin: 46, boxMargin: 8, mirrorActors: false },
    }), THEMES[mode])
    for (const [i, code] of blocks.entries()) {
      try {
        const svg = await page.evaluate(
          async ([id, def]) => (await window.mermaid.render(id, def)).svg,
          [`m${mode}${i}`, code], // distinct ids: both variants live in one page
        )
        const entry = out.get(code) ?? {}
        entry[mode] = svg
        out.set(code, entry)
      } catch (e) {
        if (mode === "light")
          console.warn(`   ! mermaid block ${i + 1} failed to render: ${String(e).split("\n")[0]}`)
      }
    }
  }
  await browser.close()
  return out
}

// ── build ───────────────────────────────────────────────────────────────────
console.log("── collecting docs")
const files = await listDocs()
console.log(`   ${files.length} markdown files`)

// pass 1: read, pull mermaid out so marked cannot mangle it
const docs = []
const mermaidBlocks = []
for (const rel of files) {
  let md = await fs.readFile(path.join(DOCS, rel), "utf8")
  const mine = []
  md = md.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
    const token = `%%MERMAID_${mermaidBlocks.length}%%`
    mermaidBlocks.push(code.trim())
    mine.push(token)
    return token
  })
  const title = md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? rel
  docs.push({ rel, md, title, id: docId(rel) })
}
console.log(`   ${mermaidBlocks.length} mermaid diagrams`)

console.log("── rendering mermaid")
const svgs = await renderMermaid(mermaidBlocks)
console.log(`   ${svgs.size}/${mermaidBlocks.length} rendered to inline SVG`)

console.log("── rendering markdown + inlining images")
marked.setOptions({ gfm: true, breaks: false })

const linkTargets = new Map(docs.map((d) => [d.rel, d.id]))
for (const doc of docs) {
  let html = marked.parse(doc.md)

  // heading ids + per-doc outline (h2 only — enough to navigate, not noise)
  doc.outline = []
  html = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (m, level, inner) => {
    const text = inner.replace(/<[^>]+>/g, "").trim()
    const id = `${doc.id}-${slug(text)}`
    if (level === "2") doc.outline.push({ id, text })
    return `<h${level} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="link to this section">#</a></h${level}>`
  })

  // Tables keep normal table layout and get their OWN scroll container —
  // `display:block` on <table> is what made wide tables look cropped.
  html = html.replace(/<table>/g, '<div class="tablewrap"><table>')
             .replace(/<\/table>/g, "</table></div>")

  // cross-document links → in-page anchors
  html = html.replace(/href="([^"]+\.md)(#[^"]*)?"/g, (m, target, frag) => {
    const key = path.posix.normalize(path.posix.join(path.posix.dirname(doc.rel), target))
    const id = linkTargets.get(key) ?? linkTargets.get(target)
    return id ? `href="#${id}"` : m
  })

  html = await inlineAllImages(html, path.join(DOCS, path.dirname(doc.rel)))

  // mermaid placeholders → SVG (or a labelled code block if rendering failed)
  html = html.replace(/%%MERMAID_(\d+)%%/g, (m, i) => {
    const code = mermaidBlocks[Number(i)]
    const v = svgs.get(code)
    if (!v?.light) return `<pre class="mermaid-src"><code>${esc(code)}</code></pre>`
    // Both themes ship; CSS picks one. Print gets the light variant.
    return `<figure class="mermaid">` +
      `<span class="only-light">${v.light}</span>` +
      (v.dark ? `<span class="only-dark">${v.dark}</span>` : "") +
      `</figure>`
  })

  doc.html = html
}

// ── assemble ────────────────────────────────────────────────────────────────
let commit = "unknown"
try { commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim() } catch {}
let branch = ""
try { branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT }).toString().trim() } catch {}

const nav = docs
  .map(
    (d) => `<li><a href="#${d.id}">${esc(d.title)}</a>` +
      (d.outline.length
        ? `<ul>${d.outline.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join("")}</ul>`
        : "") + `</li>`,
  )
  .join("\n")

const body = docs
  .map(
    (d) => `<section class="doc" id="${d.id}">
  <p class="src">docs/${d.rel}</p>
  ${d.html}
</section>`,
  )
  .join("\n")

// ── search index: one entry per h2 section, plain text ──────────────────────
const stripTags = (h) =>
  h.replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
   .replace(/<svg[\s\S]*?<\/svg>/g, " ")   // diagrams carry no useful prose
   .replace(/<[^>]+>/g, " ")
   .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, " ")
   .replace(/\s+/g, " ")
   .trim()

const index = []
for (const doc of docs) {
  // split on the h2 boundaries we just tagged, so a hit lands on a section
  const parts = doc.html.split(/(?=<h2 id=")/)
  for (const part of parts) {
    const m = part.match(/^<h2 id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/)
    const text = stripTags(part)
    if (!text) continue
    index.push({
      d: doc.title,
      i: m ? m[1] : doc.id,
      h: m ? stripTags(m[2]).replace(/#$/, "").trim() : "",
      t: text.slice(0, 4000),
    })
  }
}

const template = await fs.readFile(path.join(SKILL, "scripts", "template.html"), "utf8")
const html = template
  .replace("{{NAV}}", nav)
  .replace("{{BODY}}", body)
  .replace("{{SEARCH_INDEX}}", JSON.stringify(index))
  .replace(/{{COMMIT}}/g, commit)
  .replace(/{{BRANCH}}/g, branch)
  .replace(/{{DATE}}/g, new Date().toISOString().slice(0, 10))
  .replace(/{{DOCCOUNT}}/g, String(docs.length))

await fs.mkdir(path.dirname(OUT), { recursive: true })
await fs.writeFile(OUT, html)

const kb = (n) => `${(n / 1024).toFixed(0)} KB`
console.log("")
console.log(`   images   ${imgCount} inlined, ${kb(imgBytesIn)} → ${kb(imgBytesOut)} webp` +
  (imgMissing ? ` (${imgMissing} missing)` : ""))
console.log(`   diagrams ${svgs.size} inline SVG`)
console.log(`   output   ${path.relative(ROOT, OUT)}  ${kb((await fs.stat(OUT)).size)}`)
