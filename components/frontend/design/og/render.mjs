#!/usr/bin/env node
// Render og-card.html into static/og-default.jpg — the image every link
// preview of this platform shows.
//
// Why a script and not a hand-exported binary: the card that was here before
// was produced once by a throwaway satori script, so the only way to change a
// word in it was to rebuild the tooling from the commit message. The template
// beside this file is the source; this turns it into the asset.
//
//   node components/frontend/design/og/render.mjs
//   node components/frontend/design/og/render.mjs --thumb /tmp/thumb.png
//
// Rendered at 2x and downscaled, because type rasterised at 1200px wide and
// type rasterised at 2400px and resampled are visibly different at the sizes
// this card uses — the second is what survives a feed thumbnail.
//
// Playwright and sharp are borrowed from .claude/skills/hackathon-e2e rather
// than added to the frontend's package.json: this asset is regenerated when
// the wording changes, and that is not worth ~200 MB of devDependency and a
// lockfile entry in the app that serves it.

import { createRequire } from "node:module"
import { existsSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const FRONTEND = resolve(HERE, "../..")
const ROOT = resolve(FRONTEND, "../..")

const TEMPLATE = join(HERE, "og-card.html")
const MARK = join(FRONTEND, "static/logos/sdsc_white.svg")

const WIDTH = 1200
const HEIGHT = 630
const SCALE = 2

// --hk-canvas, the theme's dark ground, as sRGB. The same value the template
// paints with: a preview card is composited onto whatever colour the client
// uses, so it has to carry its own opaque background rather than inherit one.
const CANVAS = "#0c1212"

// A preview card is fetched by a scraper on someone else's schedule, and some
// of them give up on a slow one. Comfortably under the brief's ceiling.
const MAX_BYTES = 300 * 1024

// The headline is the only thing that has to read at thumbnail size, so how
// much of the card it fills is the one number worth failing on: a stack that
// falls through to this container's CJK generic, or a font that is simply
// absent, lands outside this band — and would otherwise render a perfectly
// plausible-looking card in the wrong typeface with no error at all.
//
// Expressed as a fraction of the content box, not in pixels, so editing the
// wording or the type size does not require re-deriving a magic number. The
// upper bound is what keeps the line off the margins; the lower bound is what
// keeps it dominant enough to survive being drawn ~300px wide.
const HEADLINE_MIN_FILL = 0.55
const HEADLINE_MAX_FILL = 0.98
const HEADLINE_MAX_LINE_HEIGHT = 140

// The grid behind the card is drawn every GRID_PX, and is checked for rather
// than assumed. It went missing twice while this card was being built — an
// oklch() colour stop in a repeating-linear-gradient renders as nothing at all
// in this Firefox, with a valid computed style and an empty console — and a
// wash that quietly disappears looks exactly like a wash that was never asked
// for. GRID_ROW is a band with no text in it at any point across the card.
const GRID_PX = 60
const GRID_ROW = 470
const GRID_MIN_CONTRAST = 5
const GRID_MIN_LINES = 8

function parseArgs(argv) {
  const args = { out: join(FRONTEND, "static/og-default.jpg"), thumb: null }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") {
      args.out = resolve(argv[(i += 1)])
    } else if (argv[i] === "--thumb") {
      args.thumb = resolve(argv[(i += 1)])
    } else {
      throw new Error(`unknown argument: ${argv[i]}`)
    }
  }
  return args
}

// Resolve a dependency from whichever node_modules in this repo has it.
function borrow(name) {
  const dirs = [
    join(ROOT, ".claude/skills/hackathon-e2e/node_modules"),
    join(FRONTEND, "node_modules"),
  ]
  for (const dir of dirs) {
    try {
      return createRequire(join(dir, "borrow.cjs"))(name)
    } catch {
      continue
    }
  }
  throw new Error(
    `${name} not installed. Run 'pnpm install' in ` +
      `.claude/skills/hackathon-e2e, which owns this toolchain.`,
  )
}

// Read one row out of the FINISHED jpeg and prove the grid survived into it.
// Deliberately the finished file and not the browser's PNG: a wash can render
// and still be destroyed by the downscale or the JPEG quantiser, and the file
// is what a scraper fetches. Returns the detected line spacing.
async function assertGridVisible(sharp, file) {
  const { data, info } = await sharp(file)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const row = []
  for (let x = 0; x < info.width; x += 1) {
    row.push(data[(GRID_ROW * info.width + x) * info.channels])
  }

  const min = Math.min(...row)
  const max = Math.max(...row)
  if (max - min < GRID_MIN_CONTRAST) {
    throw new Error(
      `no grid in the output: row ${GRID_ROW} varies by only ${max - min} ` +
        `levels. An oklch() stop in a repeating-linear-gradient is the usual ` +
        `cause — see the warning in og-card.html.`,
    )
  }

  // Collect runs of above-midpoint pixels; each run is one grid line.
  const threshold = min + (max - min) / 2
  const centres = []
  let run = null
  row.forEach((v, x) => {
    if (v >= threshold) {
      run = run ?? { start: x }
      run.end = x
    } else if (run) {
      centres.push((run.start + run.end) / 2)
      run = null
    }
  })
  if (run) centres.push((run.start + run.end) / 2)

  if (centres.length < GRID_MIN_LINES) {
    throw new Error(
      `found ${centres.length} grid lines in row ${GRID_ROW}, expected at ` +
        `least ${GRID_MIN_LINES} — the band may have drifted onto text`,
    )
  }

  const gaps = centres.slice(1).map((c, i) => c - centres[i])
  gaps.sort((a, b) => a - b)
  const spacing = gaps[Math.floor(gaps.length / 2)]
  if (Math.abs(spacing - GRID_PX) > 2) {
    throw new Error(
      `grid lines are ${spacing}px apart, expected ${GRID_PX}px — that is ` +
        `not the grid, so something else is being measured`,
    )
  }
  return { spacing, lines: centres.length, contrast: max - min }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  for (const [what, path] of [
    ["template", TEMPLATE],
    ["SDSC mark", MARK],
  ]) {
    if (!existsSync(path)) throw new Error(`missing ${what}: ${path}`)
  }

  const { firefox } = borrow("@playwright/test")
  const sharp = borrow("sharp")

  const browser = await firefox.launch()
  let png
  let measured
  try {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: SCALE,
    })
    await page.goto(pathToFileURL(TEMPLATE).href, { waitUntil: "load" })

    // The mark is an <img>; screenshotting before it decodes yields a card
    // with a hole where the logo goes, and nothing about that fails loudly.
    await page.waitForFunction(() => {
      const img = document.querySelector("#mark")
      return img && img.complete && img.naturalWidth > 0
    })

    measured = await page.evaluate(() => {
      const cardEl = document.querySelector("#card")
      const headlineEl = document.querySelector("#headline")
      const card = cardEl.getBoundingClientRect()

      // Measure the TEXT, via a Range over the element's contents — not the
      // element. #headline is a block, so its own rect is the width of the
      // column it sits in: 1056px whatever font rendered, whatever the words
      // say. Asserting on that number is asserting on the padding.
      const range = document.createRange()
      range.selectNodeContents(headlineEl)
      const text = range.getBoundingClientRect()

      return {
        card: { width: card.width, height: card.height },
        // The box the headline is allowed to fill, from the element's own
        // layout rather than a repeated padding constant.
        contentWidth: headlineEl.getBoundingClientRect().width,
        headline: { width: text.width, height: text.height, right: text.right },
      }
    })

    png = await page.locator("#card").screenshot({ type: "png" })
  } finally {
    await browser.close()
  }

  const { card, contentWidth, headline } = measured
  const fill = headline.width / contentWidth

  if (card.width !== WIDTH || card.height !== HEIGHT) {
    throw new Error(
      `template laid out at ${card.width}x${card.height}, expected ` +
        `${WIDTH}x${HEIGHT}`,
    )
  }
  if (fill < HEADLINE_MIN_FILL || fill > HEADLINE_MAX_FILL) {
    throw new Error(
      `headline fills ${(fill * 100).toFixed(1)}% of the content box ` +
        `(allowed ${HEADLINE_MIN_FILL * 100}–${HEADLINE_MAX_FILL * 100}%) — ` +
        `the intended font probably did not load, or the wording changed`,
    )
  }
  if (headline.height > HEADLINE_MAX_LINE_HEIGHT) {
    throw new Error(
      `headline wrapped to ${Math.round(headline.height)}px tall — it must ` +
        `stay on one line`,
    )
  }
  if (headline.right > WIDTH) {
    throw new Error(
      `headline overflows the card by ${headline.right - WIDTH}px`,
    )
  }

  // flatten() drops any alpha onto the card's own ground rather than letting
  // the JPEG encoder pick: the card is composited onto whatever colour the
  // client uses, so it has to carry its own background.
  await sharp(png)
    .resize(WIDTH, HEIGHT, { kernel: "lanczos3" })
    .flatten({ background: CANVAS })
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toFile(args.out)

  const meta = await sharp(args.out).metadata()
  const bytes = statSync(args.out).size

  if (meta.width !== WIDTH || meta.height !== HEIGHT) {
    throw new Error(
      `wrote ${meta.width}x${meta.height}, expected ${WIDTH}x${HEIGHT}`,
    )
  }
  if (meta.hasAlpha) throw new Error("output carries an alpha channel")
  if (bytes > MAX_BYTES) {
    throw new Error(`${bytes} bytes exceeds the ${MAX_BYTES} byte ceiling`)
  }

  const grid = await assertGridVisible(sharp, args.out)

  if (args.thumb) {
    // The check that matters: most clients draw this around 300px wide.
    await sharp(args.out).resize(300).toFile(args.thumb)
  }

  const kib = (bytes / 1024).toFixed(1)
  process.stdout.write(
    `${args.out}\n` +
      `  ${meta.width}x${meta.height}  ${kib} KiB  ${meta.format}  ` +
      `alpha=${Boolean(meta.hasAlpha)}\n` +
      `  headline text ${Math.round(headline.width)}px wide ` +
      `(${(fill * 100).toFixed(0)}% of the content box), rendered at ` +
      `${SCALE}x\n` +
      `  grid ${grid.lines} lines at ${grid.spacing}px, ` +
      `${grid.contrast} levels of contrast\n` +
      (args.thumb ? `  thumbnail: ${args.thumb}\n` : ""),
  )
}

await main()
