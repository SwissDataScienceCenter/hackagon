import { test, expect, type Page } from "@playwright/test"

/**
 * Screenshot + layout utility for the Keycloak `hackagon` login theme. Not a
 * product test — it renders the pages the theme owns (username step, password
 * step, registration) and reports on them:
 *
 *  - "theme <page> <scheme> <width>" — full-page PNGs into .artifacts/theme/,
 *    light and dark, desktop → phone, plus a horizontal-overflow probe that
 *    names the offending elements instead of leaving a mystery.
 *  - "theme keyboard <page>" — the phone soft-keyboard case. iOS Safari does
 *    NOT shrink the layout viewport when the keyboard opens; it only shrinks
 *    the *visual* viewport. So a page that is exactly one viewport tall and
 *    hard-centred has zero scroll range, and Safari cannot lift a focused
 *    field (or the submit button) above the keyboard. We model that: keep the
 *    layout viewport at 390x844, then ask whether some scroll offset exists
 *    that puts both the focused input and the submit button inside the
 *    ~460px band left above an iPhone keyboard + autofill accessory bar.
 *
 * Runs only with THEME_SHOT=1 (project tunnel, --grep theme):
 *
 *   THEME_SHOT=1 pnpm exec playwright test --project=tunnel --grep "theme"
 */
const enabled = !!process.env.THEME_SHOT

const KC = "http://localhost:8180/realms/hackagon/protocol/openid-connect"
const QS =
  "?client_id=hackagon-frontend&response_type=code" +
  "&redirect_uri=http://localhost:8081/auth/callback/keycloak&scope=openid"
const LOGIN_URL = `${KC}/auth${QS}`
const REGISTER_URL = `${KC}/registrations${QS}`

/**
 * iPhone 12/13/14 class device: 390x844 CSS px layout viewport. With the
 * software keyboard and Safari's autofill accessory bar up, roughly 460px of
 * visual viewport is left above them (844 - ~336 keyboard - ~48 accessory).
 */
const PHONE = { width: 390, height: 844 }
const VISIBLE_WITH_KEYBOARD = 460

/** The realm splits sign-in: username first, password on a second screen. */
async function gotoPasswordStep(page: Page) {
  await page.goto(LOGIN_URL)
  await page.fill("#username", "alice")
  await page.click("#kc-login")
  await page.waitForSelector("#password")
}

const pages = [
  { name: "login", open: (p: Page) => p.goto(LOGIN_URL).then(() => {}) },
  { name: "login-password", open: gotoPasswordStep },
  { name: "register", open: (p: Page) => p.goto(REGISTER_URL).then(() => {}) },
] as const

const viewports = [
  { tag: "1440", width: 1440, height: 900 },
  { tag: "1280", width: 1280, height: 900 },
  { tag: "768", width: 768, height: 1024 },
  { tag: "390", width: 390, height: 844 },
] as const

const schemes = ["light", "dark"] as const

test.describe("login theme screenshots", () => {
  test.skip(!enabled, "THEME_SHOT not set — utility spec, skipped in suites")

  for (const p of pages) {
    for (const scheme of schemes) {
      for (const vp of viewports) {
        test(`theme ${p.name} ${scheme} ${vp.tag}`, async ({ browser }) => {
          const ctx = await browser.newContext({
            colorScheme: scheme,
            viewport: { width: vp.width, height: vp.height },
          })
          const page = await ctx.newPage()
          await p.open(page)
          await page.waitForLoadState("networkidle")

          // Horizontal overflow must be exactly 0 at every width. When it is
          // not, name the elements poking past the viewport rather than
          // guessing (and rather than hiding them with overflow-x: hidden).
          const diag = await page.evaluate(() => {
            const doc = document.documentElement
            const overflow = doc.scrollWidth - window.innerWidth
            const offenders: string[] = []
            if (overflow > 0) {
              for (const el of Array.from(document.querySelectorAll("*"))) {
                const r = el.getBoundingClientRect()
                if (r.width === 0) continue
                if (r.right > window.innerWidth + 1 || r.left < -1) {
                  const id = el.id ? `#${el.id}` : ""
                  const cls = el.className
                    ? `.${String(el.className).trim().split(/\s+/).join(".")}`
                    : ""
                  offenders.push(
                    `${el.tagName.toLowerCase()}${id}${cls} ` +
                      `[left=${Math.round(r.left)} right=${Math.round(r.right)} w=${Math.round(r.width)}]`,
                  )
                }
              }
            }
            return { overflow, offenders: offenders.slice(0, 12) }
          })

          console.log(
            `[theme] ${p.name} ${scheme} ${vp.tag}px overflow=${diag.overflow}` +
              (diag.offenders.length ? `\n  ${diag.offenders.join("\n  ")}` : ""),
          )
          expect(
            diag.overflow,
            `horizontal overflow at ${vp.tag}px:\n${diag.offenders.join("\n")}`,
          ).toBe(0)

          await page.screenshot({
            path: `.artifacts/theme/${p.name}-${scheme}-${vp.tag}.png`,
            fullPage: true,
          })
          await ctx.close()
        })
      }
    }
  }
})

/**
 * Error states. Field-level validation messages and the page-level alert are
 * the easiest things to leave unreadable in one of the two colour schemes, so
 * they get their own captures.
 */
const errorPages = [
  {
    name: "register-errors",
    open: async (p: Page) => {
      await p.goto(REGISTER_URL)
      await p.fill("#username", "alice")
      await p.fill("#password", "abc")
      await p.fill("#password-confirm", "xyz")
      await p.fill("#email", "not-an-email")
      await p.click("#kc-register-form input[type=submit]")
      await p.waitForSelector(".pf-m-error, .pf-v5-c-alert")
    },
  },
  {
    name: "login-error",
    open: async (p: Page) => {
      await gotoPasswordStep(p)
      await p.fill("#password", "definitely-wrong")
      await p.click("#kc-login")
      await p.waitForSelector(".pf-v5-c-alert, .pf-m-error")
    },
  },
] as const

test.describe("login theme error states", () => {
  test.skip(!enabled, "THEME_SHOT not set — utility spec, skipped in suites")

  for (const p of errorPages) {
    for (const scheme of schemes) {
      for (const tag of ["1280", "390"] as const) {
        const vp = viewports.find((v) => v.tag === tag)!
        test(`theme ${p.name} ${scheme} ${vp.tag}`, async ({ browser }) => {
          const ctx = await browser.newContext({
            colorScheme: scheme,
            viewport: { width: vp.width, height: vp.height },
          })
          const page = await ctx.newPage()
          await p.open(page)
          await page.waitForLoadState("networkidle")
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          )
          console.log(`[theme] ${p.name} ${scheme} ${vp.tag}px overflow=${overflow}`)
          await page.screenshot({
            path: `.artifacts/theme/${p.name}-${scheme}-${vp.tag}.png`,
            fullPage: true,
          })
          await ctx.close()
          expect(overflow).toBe(0)
        })
      }
    }
  }
})

/**
 * Soft-keyboard occlusion. Reported from a real iPhone: focusing the password
 * field left the input half under Safari's autofill bar and the Sign In button
 * entirely under the keyboard, with no way to scroll to them.
 */
const keyboardCases = [
  { name: "login", open: (p: Page) => p.goto(LOGIN_URL).then(() => {}), field: "#username", submit: "#kc-login" },
  { name: "login-password", open: gotoPasswordStep, field: "#password", submit: "#kc-login" },
  { name: "register", open: (p: Page) => p.goto(REGISTER_URL).then(() => {}), field: "#password", submit: "#kc-register-form input[type=submit]" },
] as const

test.describe("login theme keyboard", () => {
  test.skip(!enabled, "THEME_SHOT not set — utility spec, skipped in suites")

  for (const c of keyboardCases) {
    test(`theme keyboard ${c.name}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: PHONE, colorScheme: "light" })
      const page = await ctx.newPage()
      await c.open(page)
      await page.waitForLoadState("networkidle")
      await page.locator(c.field).focus()
      await page.waitForTimeout(150)

      const m = await page.evaluate(
        ({ field, submit, band }) => {
          const se = document.scrollingElement as HTMLElement
          const range = Math.max(0, se.scrollHeight - se.clientHeight)
          const box = (sel: string) => {
            const el = document.querySelector(sel)!
            const r = el.getBoundingClientRect()
            return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY }
          }
          const f = box(field)
          const s = box(submit)
          // An element is reachable when some scroll offset in [0, range] puts
          // it inside the band: it needs `bottom - band` px of scroll, and the
          // page must be able to give them. A long form legitimately cannot
          // show the focused field AND the submit button at the same time —
          // what must never happen is either being unreachable.
          const needField = Math.max(0, f.bottom - band)
          const needSubmit = Math.max(0, s.bottom - band)
          const fontSize = parseFloat(
            getComputedStyle(document.querySelector(field)!).fontSize,
          )
          return {
            range,
            docHeight: se.scrollHeight,
            clientHeight: se.clientHeight,
            fieldTop: Math.round(f.top),
            submitBottom: Math.round(s.bottom),
            needField: Math.round(needField),
            needSubmit: Math.round(needSubmit),
            fieldReachable: needField <= range,
            submitReachable: needSubmit <= range,
            fontSize,
          }
        },
        { field: c.field, submit: c.submit, band: VISIBLE_WITH_KEYBOARD },
      )

      console.log(
        `[keyboard] ${c.name} doc=${m.docHeight} client=${m.clientHeight} ` +
          `scrollRange=${m.range} field@${m.fieldTop} submitBottom=${m.submitBottom} ` +
          `needField=${m.needField}(ok=${m.fieldReachable}) ` +
          `needSubmit=${m.needSubmit}(ok=${m.submitReachable}) ` +
          `inputFontSize=${m.fontSize}px`,
      )

      // Screenshot of the "keyboard open" case: shrink to the band height and
      // scroll the focused field into view, i.e. what the user actually sees.
      await page.setViewportSize({ width: PHONE.width, height: VISIBLE_WITH_KEYBOARD })
      await page.locator(c.field).scrollIntoViewIfNeeded()
      await page.locator(c.field).focus()
      await page.waitForTimeout(150)
      await page.screenshot({ path: `.artifacts/theme/keyboard-${c.name}.png` })
      await ctx.close()

      // iOS zooms the page when a focused input is under 16px, which makes the
      // occlusion worse.
      expect(m.fontSize, "input font-size must be >= 16px (iOS auto-zoom)").toBeGreaterThanOrEqual(16)
      expect(
        m.fieldReachable,
        `focused field cannot clear the keyboard: needs ${m.needField}px of scroll, range is ${m.range}px`,
      ).toBe(true)
      expect(
        m.submitReachable,
        `submit button cannot clear the keyboard: needs ${m.needSubmit}px of scroll, range is ${m.range}px`,
      ).toBe(true)
    })
  }
})
