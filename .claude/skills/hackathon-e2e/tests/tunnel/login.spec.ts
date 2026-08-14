import { test, expect } from "@playwright/test"
import { PERSONAS } from "../../personas.js"
import { onTunnel, onTunnelRealm } from "./host.js"

/**
 * Proves OIDC login works through the Cloudflare tunnel — quick or named, the
 * spec does not care which. Bring the tunnel up with issuer rewiring first,
 * then run with its URL:
 *
 *   bash .claude/skills/cloudflare-tunnel/scripts/up.sh --with-auth
 *   TUNNEL_BASE_URL=https://hackagon.example.org \
 *     pnpm exec playwright test --project=tunnel
 *
 * The whole flow must stay on the tunnel host: a redirect to localhost:8180
 * means the issuer rewiring is not in effect (view-only tunnel). The host comes
 * from TUNNEL_BASE_URL rather than from a literal domain — see host.ts.
 */
const base = process.env.TUNNEL_BASE_URL

test.describe("login through the tunnel", () => {
  test.skip(!base, "TUNNEL_BASE_URL not set — start the tunnel with --with-auth first")

  test("alice logs in on the public URL and reaches her dashboard", async ({ page }) => {
    const alice = PERSONAS.alice
    await page.goto("/")
    await page.waitForLoadState("networkidle")
    await page.getByRole("button", { name: "Log in" }).click()

    // Keycloak served from the SAME public host (caddy path-multiplexes
    // /realms/* to it) — this is the step that used to dead-end on
    // localhost:8180.
    await page.waitForURL(onTunnelRealm(base), { timeout: 45_000 })

    await page.locator("#username").fill(alice.username)
    if (!(await page.locator("#password").isVisible())) {
      await page.locator("#kc-login").click()
      await page.locator("#password").waitFor({ timeout: 20_000 })
    }
    await page.locator("#password").fill(alice.password)
    await page.locator("#kc-login").click()

    // Back on the app through the tunnel, logged in. Identity is a monogram
    // <span>, not a button — this design draws it as "who you are" rather than
    // an action — so a role-based locator finds nothing even when login worked.
    await page.waitForURL(onTunnel(base), { timeout: 30_000 })
    await expect(
      page.locator("header").getByText(alice.initial, { exact: true }),
    ).toBeVisible({ timeout: 20_000 })

    // The dashboard runs authenticated gRPC calls server-side — this passing
    // proves the backend accepts tokens stamped with the tunnel issuer.
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")
    expect(page.url()).toContain("/dashboard")
    await expect(
      page.locator("header").getByText(alice.initial, { exact: true }),
    ).toBeVisible()
  })
})
