/*
 * Drive a real browser through the wired app and record what the tracker put
 * on the wire.
 *
 * This is the CLIENT half of the proof. It exists because "the app renders a
 * script tag" and "a page view was counted" are different claims, and because
 * every privacy property this integration has is a property of the BYTES —
 * an assertion that a config flag is set would have passed while the tracker
 * shipped `/invite/<token>`.
 *
 * It deliberately does NOT judge whether Plausible stored anything: that is
 * the far end, and verify.sh asks Plausible itself. Session replay was green
 * for three days here while every recorded session was unplayable, because
 * every spec measured what left the browser and nothing asked the server.
 *
 * Usage (inside the dev container, from the hackathon-e2e skill dir so the
 * playwright dependency resolves):
 *   node …/plausible-stack/scripts/pageview.mjs <appUrl> <plausibleOrigin> <hackathonId> <out.json>
 */
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { writeFileSync } from "node:fs"

// Playwright and its Firefox come from the SIBLING skill, which is the only
// place in this repo that installs them. Borrowed through `createRequire`
// anchored at that package rather than imported directly, because ESM resolves
// bare specifiers relative to the FILE, and this file lives in a directory with
// no node_modules — `cd`-ing there first does not help.
const HERE = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(
  path.join(HERE, "..", "..", "hackathon-e2e", "package.json"),
)
const { firefox } = require("@playwright/test")

const [appUrl, plausibleOrigin, hackathonId, out] = process.argv.slice(2)
if (!appUrl || !plausibleOrigin || !out) {
  console.error(
    "usage: pageview.mjs <appUrl> <plausibleOrigin> <hackathonId> <out.json>",
  )
  process.exit(2)
}

// A token that could not possibly be real, but has the SHAPE of one — the
// point is to prove the shape never reaches the wire, so it must be
// recognisable in a grep of the captured bodies.
const FAKE_TOKEN = "plausible-proof-token-4f2a9c7e"

const events = []
const browser = await firefox.launch()
const page = await browser.newPage()

page.on("request", (req) => {
  if (req.method() !== "POST") return
  if (!req.url().startsWith(`${plausibleOrigin}/api/event`)) return
  let body = req.postData()
  try {
    body = JSON.parse(body)
  } catch {
    /* keep the raw string — a body we cannot parse is still evidence */
  }
  events.push({ url: req.url(), body })
})

async function visit(path, { click } = {}) {
  if (click) {
    // A CLIENT-SIDE navigation, which is the case `afterNavigate` handles and
    // the only case where document.referrer is non-empty and points at one of
    // our own paths.
    const link = page.locator(`a[href="${path}"]`).first()
    if ((await link.count()) > 0) {
      await link.click()
      await page.waitForURL(`**${path}`, { timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(2500)
      return "clicked"
    }
  }
  await page.goto(`${appUrl}${path}`, { waitUntil: "load", timeout: 30000 })
  // The first pageview is fired from an idle callback after first paint.
  await page.waitForTimeout(2500)
  return "goto"
}

const visited = []
visited.push(["/", await visit("/")])
if (hackathonId) {
  visited.push([
    `/hackathon/${hackathonId}`,
    await visit(`/hackathon/${hackathonId}`, { click: true }),
  ])
}
visited.push([`/invite/${FAKE_TOKEN}`, await visit(`/invite/${FAKE_TOKEN}`)])

await browser.close()

const raw = JSON.stringify(events)
const sent = events.map((e) => (e.body && e.body.u) || null)

// ── the client-side claims, judged here because the bodies are here ────────
const problems = []
if (events.length === 0)
  problems.push("no /api/event request left the browser at all")

// The positive control comes FIRST: an "id absent" assertion agrees with
// everything when nothing was ever sent, and this repo has shipped exactly
// that mistake more than once.
const expectPage = hackathonId ? "/hackathon/[id]" : "/"
if (!sent.some((u) => u && u.endsWith(expectPage)))
  problems.push(
    `no pageview carried the route template ${expectPage} (got ${JSON.stringify(sent)})`,
  )

if (hackathonId && raw.includes(hackathonId))
  problems.push(`the hackathon id ${hackathonId} appeared on the wire`)
if (raw.includes(FAKE_TOKEN))
  problems.push(`the invite token appeared on the wire`)
if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(raw))
  problems.push("a UUID appeared on the wire")

// Referrers: our own origin must never be sent with a path attached.
for (const e of events) {
  const r = e.body && e.body.r
  if (r && r.startsWith(appUrl) && r !== appUrl && r !== `${appUrl}/`)
    problems.push(`an internal referrer with a path was sent: ${r}`)
}

writeFileSync(out, JSON.stringify({ visited, events, problems }, null, 2))

console.log(`visited: ${visited.map(([p, how]) => `${p} (${how})`).join(", ")}`)
console.log(`events:  ${events.length}`)
for (const u of sent) console.log(`  u = ${u}`)
if (problems.length) {
  for (const p of problems) console.log(`PROBLEM: ${p}`)
  process.exit(1)
}
console.log("client-side: OK")
