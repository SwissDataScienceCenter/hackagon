import tailwindcss from "@tailwindcss/vite"
import { sveltekit } from "@sveltejs/kit/vite"
import { svelteTesting } from "@testing-library/svelte/vite"
import { defineConfig } from "vite"
import path from "path"

const coverageDir = path.join(
  process.env.QUITSH_COVERAGE_DIR || "build",
  "coverage",
  "data",
)

export default defineConfig({
  // svelteTesting puts `browser` ahead of `node` in resolve.conditions, so a
  // component test mounts Svelte's client build instead of its SSR build, which
  // has no `mount()` and fails with lifecycle_function_unavailable. It no-ops
  // unless process.env.VITEST is set, so dev and build are untouched.
  //
  // Its auto-cleanup half is skipped here because `test.globals` is on, so
  // src/setup-tests.ts registers that itself.
  plugins: [tailwindcss(), sveltekit(), svelteTesting({ autoCleanup: false })],

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
