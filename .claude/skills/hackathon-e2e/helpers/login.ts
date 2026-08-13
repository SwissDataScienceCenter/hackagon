import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test"
import {
  KEYCLOAK,
  type Persona,
  type PersonaKey,
  type SelfRegistrant,
} from "../personas.js"
import { storageStatePath } from "./state.js"

/**
 * Drives the real login flow: frontend "Log in" button -> Auth.js redirect to
 * Keycloak -> Keycloak login form -> redirect back to the app. The Keycloak
 * provider is configured with prompt=login, so this always shows the form
 * (no silent SSO reuse between personas).
 */
export async function loginViaKeycloak(
  page: Page,
  persona: Pick<Persona, "username" | "password" | "initial">,
): Promise<void> {
  // Right after a state wipe, the first redirect to a freshly imported realm
  // can exceed 20s while Keycloak warms up — retry the whole entry once.
  for (let attempt = 1; ; attempt++) {
    await page.goto("/")
    await page.waitForLoadState("networkidle")
    await page.getByRole("button", { name: "Log in" }).click()
    try {
      await page.waitForURL(keycloakUrlPattern(), { timeout: 45_000 })
      break
    } catch (err) {
      if (attempt >= 2) throw err
    }
  }

  await fillKeycloakForm(page, persona)

  // Back on the app, logged in: the NavBar shows the avatar button with the
  // user's initial instead of the "Log in" button.
  await page.waitForURL(/localhost:8081/, { timeout: 20_000 })
  await expectSignedIn(page, persona.initial)
}

/** Matches any URL served by the dev Keycloak, whatever the realm path. */
export function keycloakUrlPattern(): RegExp {
  return new RegExp(
    KEYCLOAK.baseUrl.replace(/^https?:\/\//, "").replace(/[.:]/g, "\\$&"),
  )
}

/**
 * The Keycloak credential screens, from a page already sitting on them.
 *
 * Split out of loginViaKeycloak so a test can reach Keycloak by a route of its
 * own — the sign-in interstitial, for one — and still finish the login the same
 * way every other spec does. The realm serves a TWO-STEP flow (username -> Sign
 * In -> password screen); falls through to single-step if #password is already
 * present alongside #username.
 */
export async function fillKeycloakForm(
  page: Page,
  credentials: Pick<Persona, "username" | "password">,
): Promise<void> {
  await page.locator("#username").waitFor({ timeout: 20_000 })
  await page.locator("#username").fill(credentials.username)
  if (!(await page.locator("#password").isVisible())) {
    await page.locator("#kc-login").click()
    await page.locator("#password").waitFor({ timeout: 20_000 })
  }
  await page.locator("#password").fill(credentials.password)
  await page.locator("#kc-login").click()
}

/**
 * The monogram, not a button: this design renders identity as a <span>
 * ("identity, not an action to be drawn toward"), so a role-based locator finds
 * nothing even though the user is signed in.
 */
export async function expectSignedIn(page: Page, initial: string): Promise<void> {
  await expect(
    page.locator("header").getByText(initial, { exact: true }),
  ).toBeVisible()
}

/**
 * Drives Keycloak SELF-registration: frontend "Log in" -> Keycloak ->
 * "Register" link -> signup form -> auto-login back into the app (the realm
 * has registrationAllowed on and verifyEmail off). Idempotent in the same
 * spirit as roster.sh: when the account already exists (a --no-reset rerun),
 * falls back to the normal login flow with the same credentials.
 */
export async function registerViaKeycloak(
  page: Page,
  reg: SelfRegistrant,
): Promise<void> {
  const kc = new RegExp(KEYCLOAK.baseUrl.replace(/^https?:\/\//, "").replace(/[.:]/g, "\\$&"))

  await page.goto("/")
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "Log in" }).click()
  await page.waitForURL(kc, { timeout: 45_000 })

  await page.getByRole("link", { name: "Register" }).click()
  await page.locator("#username").waitFor({ timeout: 20_000 })
  await page.locator("#firstName").fill(reg.firstName)
  await page.locator("#lastName").fill(reg.lastName)
  await page.locator("#email").fill(reg.email)
  await page.locator("#username").fill(reg.username)
  await page.locator("#password").fill(reg.password)
  await page.locator("#password-confirm").fill(reg.password)
  await page.locator('input[type="submit"], button[type="submit"]').first().click()

  try {
    await page.waitForURL(/localhost:8081/, { timeout: 15_000 })
  } catch {
    // Still on Keycloak: the only expected reason is an already-registered
    // account from a --no-reset rerun — log in with the same credentials.
    if (await page.getByText(/already exists/i).first().isVisible()) {
      await loginViaKeycloak(page, reg)
      return
    }
    throw new Error("registration did not return to the app and no 'already exists' error is shown")
  }
  await expect(
    page.locator("header").getByText(reg.initial, { exact: true }),
  ).toBeVisible()
}

/** New browser context authenticated as the persona (from saved storage state). */
export async function contextFor(
  browser: Browser,
  key: PersonaKey,
): Promise<BrowserContext> {
  return browser.newContext({ storageState: storageStatePath(key) })
}

/**
 * New anonymous browser context — genuinely no cookies.
 *
 * The empty storage state is REQUIRED, not tidiness. `browser.newContext()`
 * inherits the enclosing `test.use({ storageState })`, so a bare call inside a
 * describe that sets a persona returned that PERSONA's session while being
 * named "anonymous". Measured: inside
 * `test.use({ storageState: storageStatePath("admin") })` a bare context came
 * back holding `authjs.session-token`, and an "anonymous" POST to a
 * global-admin-only endpoint was answered with a valid presign — a hole that
 * did not exist, asserted by a test that could not have seen one that did.
 *
 * `storageState: undefined` does NOT work here: an undefined option reads as
 * "not specified" and the inherited value survives the merge. An explicit empty
 * state is the only spelling that overrides it.
 */
export async function anonymousContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: { cookies: [], origins: [] } })
}
