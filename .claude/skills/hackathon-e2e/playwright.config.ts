import { defineConfig, devices } from "@playwright/test"

// Deterministic lifecycle testing: everything runs serially in one worker.
// The journey suite is a stateful recipe (acts build on each other) and the
// smoke suite shares one seeded database, so parallelism is intentionally off.
// Retries are off for the same reason: a stateful recipe cannot be retried
// mid-way — the retry unit is a whole run after `scripts/reset.sh`.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: ".artifacts/test-results",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: ".artifacts/report" }],
    // Durable machine-readable summary. These runs are long and are often
    // launched over a `docker exec` whose client can be interrupted — when
    // that happens the list reporter's output dies with the terminal and a
    // full run yields nothing. This file survives on disk regardless.
    ["json", { outputFile: ".artifacts/results.json" }],
  ],
  use: {
    ...devices["Desktop Firefox"],
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8081",
    // `retain-on-failure` RECORDS for every test and throws the recording away
    // when it passes — so both of these write continuously to `.artifacts`,
    // which lives on the 9p bind mount in the devcontainer. That is the slow,
    // flaky side (see container trap 1), and it has failed a run outright:
    //
    //   Error: ENOENT: no such file or directory, open
    //   '.../.playwright-artifacts-1/traces/…-recording5.trace'
    //
    // reported against `act0.about.sanitized` — a SECURITY assertion, which is
    // the worst possible thing to see a spurious failure on, because the
    // instinct is to go looking at the sanitizer. The trace file it had just
    // created was gone by the time it was appended to.
    //
    // Overridable so a long serial run (the 463-action journey) can turn the
    // recording off and stop paying 9p per action: E2E_TRACE=off E2E_VIDEO=off.
    // Default unchanged, because on a passing run the artifacts cost nothing
    // and on a failing one they are how anyone diagnoses it. Screenshots stay
    // on either way — they are written once, only on failure.
    trace:
      (process.env.E2E_TRACE as "on" | "off" | "retain-on-failure") ??
      "retain-on-failure",
    screenshot: "only-on-failure",
    video:
      (process.env.E2E_VIDEO as "on" | "off" | "retain-on-failure") ??
      "retain-on-failure",
  },
  projects: [
    // Logs in every persona through the real Keycloak flow and saves a
    // storage state per persona. Visiting /dashboard during setup also
    // auto-registers each user in the backend DB (WhoAmI -> Register), which
    // is what makes the journey suite work on a completely empty database.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // Snapshot-mode suite: requires `just db::seed` (scripts/run.sh smoke does
    // this). Verifies what each persona can see/do against the seed fixture.
    {
      name: "smoke",
      testMatch: /smoke\/.*\.spec\.ts/,
      dependencies: ["setup"],
    },
    // Journey-mode suite: requires an EMPTY database (scripts/run.sh journey
    // resets state and does NOT seed). Plays the full hackathon lifecycle
    // recipe act by act; acts whose backend RPCs are missing self-skip based
    // on .state/capabilities.json written by scripts/probe.sh.
    {
      name: "journey",
      testMatch: /journey\/.*\.spec\.ts/,
      dependencies: ["setup"],
    },
    // Smartphone battery: every surface at a phone viewport — responsive
    // sanity checks (no horizontal overflow, visible header) plus a full-page
    // screenshot per page into .artifacts/mobile/. Viewport-only emulation:
    // Firefox has no isMobile/touch support, and media queries only need size.
    {
      name: "mobile",
      testMatch: /mobile\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { viewport: { width: 390, height: 844 } },
    },
    // Documentation screenshots for docs/user-flows.md. Runs against the seed
    // fixture and writes WebP straight into docs/flows/. Self-skips without
    // DOCS_SHOTS=1 so a normal run never rewrites committed images.
    { name: "docs", testMatch: /docs\/.*\.spec\.ts/, dependencies: ["setup"] },
    // Cloudflare quick-tunnel login proof: needs TUNNEL_BASE_URL (the spec
    // self-skips without it) and a tunnel brought up with
    // cloudflare-tunnel/scripts/up.sh --with-auth. No setup dependency: it
    // performs a fresh interactive login against the public URL.
    {
      name: "tunnel",
      testMatch: /tunnel\/.*\.spec\.ts/,
      use: { baseURL: process.env.TUNNEL_BASE_URL ?? "http://localhost:8081" },
    },
    // Session-replay privacy proof: types a sentinel into the registration
    // form and greps the tracker's own ingest traffic for it. Its own project
    // and NOT in smoke or journey, because it needs two things neither of
    // those may assume: a live OpenReplay
    // (.claude/skills/openreplay-stack/scripts/up.sh) and `replay.enabled:
    // true` in the frontend config. Self-skips when the config says off, so
    // running it without the rig costs nothing and claims nothing.
    {
      name: "openreplay",
      testMatch: /openreplay\/.*\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],
})
