import tailwindcss from "@tailwindcss/vite"
import { sveltekit } from "@sveltejs/kit/vite"
import { svelteTesting } from "@testing-library/svelte/vite"
import { defineConfig } from "vite"
import path from "path"
import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const coverageDir = path.join(
  process.env.QUITSH_COVERAGE_DIR || "build",
  "coverage",
  "data",
)

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
)

/**
 * The declared product version. `VERSION` at the repo root is the single source
 * of truth (`just version::bump`), so the version survives a build with no git
 * available — a shallow clone or an unpacked tarball still stamps something
 * truthful rather than "unknown".
 */
function declaredVersion(): string {
  try {
    return readFileSync(path.join(repoRoot, "VERSION"), "utf8").trim()
  } catch {
    return "0.0.0"
  }
}

/** Run git, treating any failure (no git, no repo, no commits) as "unknown". */
function git(...args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim()
  } catch {
    return ""
  }
}

/**
 * Whether git can tell us anything truthful about this tree.
 *
 * The Nix sandbox builds from a fileset with no history and then runs
 * `git init .` for the sake of the tooling, which leaves a repo with no commits
 * and several hundred untracked files. Asking `git status --porcelain` there
 * answers "dirty" — so the image footer used to read `v0.0.0-dirty` on every
 * build, which is a lie in both halves. A repo is only worth believing once it
 * has a HEAD to compare against.
 */
function hasGitHistory(): boolean {
  return (
    git("rev-parse", "--is-inside-work-tree") === "true" &&
    git("rev-parse", "--verify", "HEAD") !== ""
  )
}

/**
 * What the footer shows. A clean checkout sitting on the tag that matches
 * `VERSION` is a release and gets a bare `v0.0.1`; anything else is a build of
 * some intermediate commit and says so, because a dev build claiming to be the
 * release is how a bug report ends up pinned to the wrong code. Kept in step
 * with `just version::show`.
 */
function buildVersion(): string {
  const declared = declaredVersion()

  // No history means no claim: fall back to the bare declared version rather
  // than inventing a `-dirty` suffix out of a tree git has never seen. In a
  // released image the commit arrives at runtime instead — see
  // `$lib/version` and the `HACKAGON_BUILD_COMMIT` the image carries.
  if (!hasGitHistory()) return `v${declared}`

  const commit = git("rev-parse", "--short=7", "HEAD")
  const dirty = git("status", "--porcelain") !== ""
  const onTag = git("tag", "--points-at", "HEAD")
    .split("\n")
    .includes(`v${declared}`)

  if (onTag && !dirty) return `v${declared}`
  return `v${declared}${commit ? `+${commit}` : ""}${dirty ? "-dirty" : ""}`
}

export default defineConfig({
  // svelteTesting puts `browser` ahead of `node` in resolve.conditions, so a
  // component test mounts Svelte's client build instead of its SSR build, which
  // has no `mount()` and fails with lifecycle_function_unavailable. It no-ops
  // unless process.env.VITEST is set, so dev and build are untouched.
  //
  // Its auto-cleanup half is skipped here because `test.globals` is on, so
  // src/setup-tests.ts registers that itself.
  plugins: [tailwindcss(), sveltekit(), svelteTesting({ autoCleanup: false })],

  // Resolved once at config load, so the stamp reflects the commit the server
  // was started from and does not drift as you edit. Read through
  // `$lib/version`, never as a bare global.
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion()),
  },

  // configuration for Vitest
  server: {
    port: 8081, // Port fixed also in keycloak realm allowed redirects.
    strictPort: true,
  },
  test: {
    // Enable Vitest's global APIs (describe, it, expect, etc.)
    // This means you don't have to import them in every test file.
    globals: true,

    // Use 'jsdom' to simulate the browser's DOM environment.
    // Required for component testing with @testing-library/svelte.
    environment: "jsdom",

    // Run setup file(s) before each test file.
    setupFiles: ["./src/setup-tests.ts"],

    // Define which files Vitest should consider as tests.
    include: ["src/**/*.{test,spec}.{js,ts}"],

    // Coverage settings.
    coverage: {
      reportsDirectory: coverageDir,
    },
  },
})
