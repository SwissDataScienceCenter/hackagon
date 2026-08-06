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
    // Uploaded files are served from the app's OWN origin at /objects, not from
    // the object store's host. The database therefore stores a root-relative
    // path, which resolves wherever the app is reached from — localhost, the
    // Cloudflare tunnel, or a deployment — instead of a hostname that is only
    // correct on the machine that wrote it.
    //
    // Caddy has the matching route for the tunnel and the built server; this
    // one covers `vite dev`.
    proxy: {
      "/objects": {
        target: "http://rustfs:9000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/objects/, ""),
      },
    },
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
