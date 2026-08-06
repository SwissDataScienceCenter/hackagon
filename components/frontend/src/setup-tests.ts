// Automatically extends Vitest's expect with jest-dom matchers
import "@testing-library/jest-dom/vitest"
// Unmounts anything a component test rendered, between tests. Imported here
// rather than left to svelteTesting()'s autoCleanup, which opts out whenever
// `test.globals` is on — without it, rendered DOM accumulates across tests and
// queries start matching earlier tests' output.
import "@testing-library/svelte/vitest"
import { setupLogger } from "$lib/server/logger"

const configDir = process.env.TEST_CONFIG_DIR
if (!configDir) {
  throw "Config file not defined by env. variable TEST_CONFIG_DIR."
}

setupLogger(true)
