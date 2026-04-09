import pino from "pino"
import { createRequire } from "module"
const require = createRequire(import.meta.url)

const redactionPaths = [
  "config.oidc.*",
  "settings.oidc.*",
  "secret",
  "*.secret",
  "token",
  "*.token",
  "authorization",
  "*.authorization",
  "req.headers.authorization",
]

// The global logger singelton.
export let logger = createLogger()

function createLogger(forceDevLog: boolean = false) {
  const logLevel = process.env.LOG_LEVEL || "info"

  const devLog = import.meta.env.MODE == "development" || forceDevLog

  // Basic pino logger configuration
  const loggerConfig = {
    level: logLevel,
    redact: redactionPaths,
    // Use pino-pretty for human-readable logs in development
    serializers: {
      error: (err: unknown) => {
        // Type guard to ensure it's an object we can work with
        if (err && typeof err === "object") {
          // Cast to a record to allow property access without 'any'
          const e = err as Record<string, unknown>
          if ("message" in e) {
            return {
              message: e.message,
              ...(e.code ? { code: e.code } : {}),
              ...(e.details ? { details: e.details } : {}),
              // Only include stack in dev mode for cleaner production logs
              ...(e.stack && devLog ? { stack: e.stack } : {}),
            }
          }
        }
        return err
      },
    },
    ...(devLog && {
      transport: {
        target: require.resolve("pino-pretty"),
        options: {
          colorize: true,
        },
      },
    }),
  }

  return pino(loggerConfig)
}

// Setups the log. Should be called after config has been parsed.
export function setupLogger(forceDevLog?: boolean) {
  logger = createLogger(forceDevLog)
  logger.info("Logger setup.")
}
