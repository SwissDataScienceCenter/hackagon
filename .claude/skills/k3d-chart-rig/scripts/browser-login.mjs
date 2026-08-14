// A REAL BROWSER signing in through the public https hostname.
//
//   node browser-login.mjs <app-url> <auth-host> [username] [password]
//
// Everything else in this rig is curl, and curl cannot answer the question this
// mode exists to ask. `__Secure-` is a COOKIE-PREFIX rule and it lives in the
// browser: a user agent must refuse to store a `__Secure-` cookie that did not
// arrive over a secure connection, and must refuse to send one over an insecure
// one. curl implements no such rule — it would keep and replay that cookie over
// plain http quite happily, so a green curl login says nothing about whether the
// prefix works. The *.localhost mode could not test it either, because it has no
// https at all and `frontend.config.cookies.useSecure` is false there.
//
// So the assertions below are specifically the ones that need a browser:
//
//   1. the whole round-trip completes across TWO public hostnames (the app's and
//      Keycloak's), each with its own certificate check by the browser itself;
//   2. the session cookie is NAMED `__Secure-authjs.session-token` and the
//      browser STORED it — which it would refuse to do over http;
//   3. a later request carries it back, read out of the app's own /auth/session
//      rather than out of the cookie jar: "the browser has a cookie" and "the
//      server accepted it" are different claims, and this repo has a written
//      record of measuring the first and reporting the second.
//
// Firefox, because it is what the e2e suite already installs in this container
// and because a second engine's cookie rules are not the thing under test.
//
// Playwright is BORROWED from the hackathon-e2e skill rather than installed a
// second time — that skill already carries it and its browsers, and two copies
// of a 300 MB dependency drift. ESM resolves from the SCRIPT's directory, not
// the cwd, so `createRequire` anchored at that package.json is what finds it;
// `PW_FROM` moves the anchor for a machine that keeps it elsewhere.
import { createRequire } from "node:module"
const require = createRequire(
  process.env.PW_FROM ||
    new URL("../../hackathon-e2e/package.json", import.meta.url),
)
const { firefox } = require("@playwright/test")

const [appUrl, authHost, username = "alice", password = "aliceandbob"] =
  process.argv.slice(2)
if (!appUrl || !authHost) {
  console.error(
    "usage: node browser-login.mjs <app-url> <auth-host> [user] [pass]",
  )
  process.exit(2)
}
const appHost = new URL(appUrl).hostname

let pass = 0
let fail = 0
const ok = (m) => {
  pass++
  console.log(`  ok   ${m}`)
}
const bad = (m, detail) => {
  fail++
  console.log(`  FAIL ${m}`)
  if (detail !== undefined) console.log(`        ${detail}`)
}
const check = (m, cond, detail) => (cond ? ok(m) : bad(m, detail))

// ⚠ THIS PROCESS MAY NEED AN /etc/hosts PIN TO RESOLVE ITS OWN TARGET, and that
// is a property of the network rather than of the tunnel. The one these
// containers run on answers AAAA-ONLY for Cloudflare-proxied names and has no
// IPv6 route out: `getent hosts` returns two v6 addresses, none reachable, and
// Firefox fails in 3 ms with NS_ERROR_UNKNOWN_HOST. `browser-check.sh` writes
// the pin from a DoH-resolved A record and takes it away again — the same fix
// .claude/CLAUDE.md records for the dev tunnels.
//
// Measured on the way: `firefoxUserPrefs: {"network.dns.disableIPv6": true}` is
// NOT enough on its own. It stops the browser PREFERRING v6, and here the
// resolver never offers an A record at all, so turning v6 off leaves nothing to
// fall back to and the failure is identical. The pin has to supply the address.
const browser = await firefox.launch()
// No ignoreHTTPSErrors, and its absence is an assertion: every navigation below
// is verified against Firefox's own trust store. Setting it would turn the one
// thing this mode adds over the *.localhost rig into a no-op.
const ctx = await browser.newContext()
const page = await ctx.newPage()

try {
  // ── 1 · the app, over a certificate the browser accepts ────────────────
  const resp = await page.goto(appUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  })
  check(
    "the landing page loads over https",
    resp?.status() === 200,
    `status ${resp?.status()}`,
  )
  check(
    "…on the public hostname",
    new URL(page.url()).protocol === "https:",
    page.url(),
  )

  const sec = await page.evaluate(() => window.isSecureContext)
  // Not decoration: `*.localhost` over plain http is ALSO a secure context (RFC
  // 6761 makes it potentially-trustworthy), so this is true in both modes and
  // proves nothing on its own — the certificate check is what `goto` succeeding
  // already established. It is asserted because the __Secure- rule below is
  // stated in terms of it.
  check("the page is a secure context", sec === true, String(sec))

  // ── 2 · sign in, which crosses to the OTHER public hostname ────────────
  //
  // The header's "Log in" is a <button> whose handler only exists after
  // hydration, so a click that lands before the bundle has run is SWALLOWED —
  // no error, no navigation. That has cost this repo a debugging session
  // already (.claude/CLAUDE.md, "the avatar swallowed its first click"), and it
  // is worse here: every hop is a public round-trip, so hydration takes longer
  // than it does on localhost. Wait for the network to settle, then retry.
  const clickLogin = async () => {
    const btn = page.getByRole("button", { name: "Log in" })
    const link = page.getByRole("link", { name: /log ?in|sign ?in/i })
    if (await btn.count()) return btn.first().click()
    if (await link.count()) return link.first().click()
    await page.goto(`${appUrl}/auth/signin`, { waitUntil: "domcontentloaded" })
    const provider = page.getByRole("button", { name: /keycloak/i })
    if (await provider.count()) await provider.first().click()
  }

  let reached = false
  for (let attempt = 1; attempt <= 3 && !reached; attempt++) {
    await page.waitForLoadState("networkidle").catch(() => {})
    await clickLogin()
    try {
      await page.waitForURL((u) => u.hostname === authHost, { timeout: 30_000 })
      reached = true
    } catch {
      if (attempt < 3)
        await page.goto(appUrl, { waitUntil: "domcontentloaded" })
    }
  }
  check(
    "sign-in reaches Keycloak on its own public hostname",
    reached,
    page.url(),
  )
  if (!reached) throw new Error(`never left ${page.url()}`)

  await page.locator("#username").waitFor({ timeout: 30_000 })
  await page.locator("#username").fill(username)
  if (!(await page.locator("#password").isVisible())) {
    await page.locator("#kc-login").click()
    await page.locator("#password").waitFor({ timeout: 30_000 })
  }
  await page.locator("#password").fill(password)
  await page.locator("#kc-login").click()

  // Back on the app. THIS is the hop that 502s when the proxy buffer is too
  // small — the callback's Set-Cookie block is chunked and multi-kilobyte.
  await page.waitForURL((u) => u.hostname === appHost, { timeout: 60_000 })
  check("Keycloak redirects back to the app", true, page.url())

  // ── 3 · the cookie the browser would have refused over http ────────────
  const cookies = await ctx.cookies()
  const names = cookies.map((c) => c.name)
  // POSITIVE CONTROL FIRST. An empty jar agrees with every claim below, and
  // "no cookie called X" reads identically to "no cookies at all".
  check(
    "the browser kept cookies for the app host",
    cookies.some((c) => c.domain.endsWith(appHost)),
    names.join(", ") || "(none)",
  )

  const session = cookies.filter((c) => /authjs\.session-token/.test(c.name))
  check(
    "a session cookie exists at all",
    session.length > 0,
    names.join(", ") || "(none)",
  )
  check(
    "it is named __Secure-authjs.session-token",
    session.every((c) => c.name.startsWith("__Secure-")),
    session.map((c) => c.name).join(", "),
  )
  check(
    "…and carries the Secure and HttpOnly flags",
    session.every((c) => c.secure && c.httpOnly),
    JSON.stringify(
      session.map((c) => ({ n: c.name, s: c.secure, h: c.httpOnly })),
    ),
  )
  check(
    "no unprefixed authjs.session-token was set alongside it",
    !names.includes("authjs.session-token"),
    names.join(", "),
  )

  // ── 4 · the server accepts it back ─────────────────────────────────────
  // Read through the PAGE, so the request carries the real cookie jar and the
  // browser's own rules about what it will send where.
  const sess = await page.evaluate(async (u) => {
    const r = await fetch(`${u}/auth/session`, { credentials: "include" })
    return { status: r.status, body: await r.text() }
  }, appUrl)
  check(
    "/auth/session identifies the signed-in user",
    /alice/.test(sess.body),
    `${sess.status} ${sess.body.slice(0, 200)}`,
  )
  check(
    "…and carries a Keycloak access token",
    /"accessToken":"ey/.test(sess.body),
    sess.body.slice(0, 120),
  )

  // ── 5 · it survives a fresh navigation ─────────────────────────────────
  // The cookie being in the jar is not the same as it being sent on the next
  // request; a Secure cookie that the browser declines to replay would look
  // identical up to here.
  await page.goto(`${appUrl}/`, { waitUntil: "domcontentloaded" })
  const after = await page.evaluate(async (u) => {
    const r = await fetch(`${u}/auth/session`, { credentials: "include" })
    return await r.text()
  }, appUrl)
  check(
    "the session survives a full page load",
    /alice/.test(after),
    after.slice(0, 160),
  )

  await page.screenshot({
    path: process.env.SHOT || "/tmp/k3d-tunnel-login.png",
    fullPage: false,
  })
} catch (err) {
  bad("the run threw", String(err).split("\n")[0])
} finally {
  await browser.close()
}

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
