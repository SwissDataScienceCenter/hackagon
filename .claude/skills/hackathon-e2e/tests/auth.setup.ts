import { test as setup, expect } from "@playwright/test"
import { ALL_PERSONAS } from "../personas.js"
import { loginViaKeycloak } from "../helpers/login.js"
import { ensureStateDir, storageStatePath } from "../helpers/state.js"

// Runs before both suites (project dependency). For every persona:
//  1. Log in through the real Keycloak flow.
//  2. Visit /dashboard — on a fresh database this is what auto-registers the
//     user in the backend (hooks.server.ts: WhoAmI -> NOT_FOUND -> Register),
//     which the journey suite depends on.
//  3. Save the browser storage state for reuse by the actual tests.

setup.beforeAll(() => ensureStateDir())

for (const persona of ALL_PERSONAS) {
  setup(
    `authenticate ${persona.key} (${persona.username})`,
    async ({ page }) => {
      await loginViaKeycloak(page, persona)

      await page.goto("/dashboard")
      await expect(
        page.getByRole("heading", { name: /Welcome back/ }),
      ).toBeVisible()

      await page.context().storageState({ path: storageStatePath(persona.key) })
    },
  )
}
