import { defineConfig, devices } from "@playwright/test"
import { outDir } from "./tests/e2e/paths"

// Browser tests against a stack that is already running: `just start` locally,
// `just deploy::up` + `just db::seed` in CI. Run them with `just check::e2e`,
// which also supplies the browsers from Nix — see the `test-e2e` toolchain in
// tools/nix/hackagon/lib/toolchain.nix.
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: `${outDir}/results`,
  reporter: [
    ["list"],
    ["html", { outputFolder: `${outDir}/report`, open: "never" }],
  ],

  // The tests share one seeded database, so they run one at a time.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,

  // Generous, because the stack serves the frontend with `vite dev`, which
  // compiles each route on its first visit.
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    // Keycloak only redirects back to this origin, see the realm's
    // `hackagon-frontend` client.
    baseURL: "http://localhost:8081",
    // Nix ships the full Chromium but not the headless shell Playwright
    // otherwise picks for headless runs. This channel runs the full browser
    // headless instead.
    channel: "chromium",
    // What the report shows for a failed test, in CI as locally (where nothing
    // is retried): the page as it was when it failed, and a trace to step back
    // through the steps before. Passing tests keep neither.
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
      dependencies: ["setup"],
    },
  ],
})
