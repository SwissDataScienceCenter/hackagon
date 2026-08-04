import tailwindcss from "@tailwindcss/vite"
import { sveltekit } from "@sveltejs/kit/vite"
import { defineConfig } from "vite"
import path from "path"

const coverageDir = path.join(
  process.env.QUITSH_COVERAGE_DIR || "build",
  "coverage",
  "data",
)

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],

  optimizeDeps: {
    exclude: ["@sjsf/form", "@sjsf/skeleton3-theme", "@sjsf/basic-theme"],
  },

  // configuration for Vitest
  server: {
    port: 8081, // Port fixed also in keycloak realm allowed redirects.
    strictPort: true,
    // Cloudflare quick tunnels (see .devcontainer/README.md) proxy the dev
    // server under a random *.trycloudflare.com host.
    allowedHosts: [".trycloudflare.com"],
    // Inotify does not cross the devcontainer bind mount on Windows hosts;
    // without polling, edits made on the host never hot-reload.
    watch: { usePolling: true, interval: 500 },
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
