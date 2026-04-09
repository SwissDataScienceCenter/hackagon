import { logger as defaultLogger } from "$lib/server/logger"
import type { Logger } from "pino"

// assert and throw error in case assert fails
export function assert(
  condition: unknown,
  message: string,
  log: Logger = defaultLogger,
): asserts condition {
  if (!condition) {
    log.fatal(`ASSERTION FAILED: ${message}`)
    throw new Error(message)
  }
}
