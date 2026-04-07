// Automatically extends Vitest's expect with jest-dom matchers
import "@testing-library/jest-dom/vitest"
import { setupLogger } from "$lib/server/logger"

const configDir = process.env.TEST_CONFIG_DIR
if (!configDir) {
  throw "Config file not defined by env. variable TEST_CONFIG_DIR."
}

setupLogger(true)
