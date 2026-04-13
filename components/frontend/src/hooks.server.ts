import { sequence } from "@sveltejs/kit/hooks"
import {
  error,
  redirect,
  type Handle,
  type HandleServerError,
  type RequestEvent,
} from "@sveltejs/kit"
import { parseArgs } from "$lib/server/args"
import { handle as authHandle } from "./auth"
import { setupLogger, logger } from "$lib/server/logger"
import { ConfigLoader } from "$lib/server/settings"
import type { Logger } from "pino"
import { callGrpc } from "$lib/server/grpc/call"
import { healthClient } from "$lib/server/grpc/client"
import type { HealthCheckResponse } from "$lib/server/grpc/generated/health"

// Global config state for the application.
let configLoader: ConfigLoader

// --- CONSTANTS ---
const PROTECTED_ROUTE_PATTERNS = [/^\/welcome($|\/)/, /^\/users($|\/)/]
const PUBLIC_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/signin($|\/)/,
  /^\/signout($|\/)/,
  /^\/auth($|\/)/,
  /^\/error($|\/)/,
]

export function isProtectedRoute(pathname: string): boolean {
  if (PUBLIC_ROUTE_PATTERNS.some((p) => p.test(pathname))) return false
  return PROTECTED_ROUTE_PATTERNS.some((p) => p.test(pathname))
}

function redirectToLogin(url: URL, logger: Logger, reason: string) {
  const returnTo = encodeURIComponent(url.pathname + url.search)
  logger.debug(`HOOKS: ${reason} -> Redirecting to login.`)
  throw redirect(303, `/?returnTo=${returnTo}`)
}

function hasLoggedInUserContext(
  session: Awaited<ReturnType<RequestEvent["locals"]["auth"]>>,
) {
  return Boolean(session?.user?.id)
}

function setupConfigAndLogger(): ConfigLoader {
  const loader = new ConfigLoader()

  try {
    const opts = parseArgs()
    loader.load(opts["config-dir"])

    setupLogger(loader.get().log?.forceDevLog)

    return loader
  } catch (err) {
    console.error("CRITICAL: Setup config & logger failed.", err)
    throw error(500, "Server Configuration Error")
  }
}

// ----------------------------------------------------------
// HANDLES: they run in sequence on every request
// ----------------------------------------------------------

// Setup: This runs first on every request. It ensures config exists and sets up the logger.
const setupHandle: Handle = async ({ event, resolve }) => {
  // Check if the Global Singleton exists.
  // If 'init' ran successfully, this is already true.
  // If we are in Dev and just saved a file, this might be null.
  if (!configLoader) {
    configLoader = setupConfigAndLogger()
  }

  // Inject into the Request Context (Locals)
  // We must do this on EVERY request because 'event.locals' is fresh every time.
  event.locals.config = configLoader.get()

  return resolve(event)
}

// Logging: Create request scoped logger
const loggerHandle: Handle = async ({ event, resolve }) => {
  const requestId = crypto.randomUUID()

  event.locals.logger = logger.child({
    requestId,
    method: event.request.method,
    path: event.url.pathname,
  })

  event.locals.logger.debug("HOOKS: Request started")
  const start = Date.now()

  // Process the Request (The rest of the chain runs here)
  const response = await resolve(event, {
    filterSerializedResponseHeaders: (name) =>
      name === "content-type" || name === "content-length",
  })

  const duration = Date.now() - start

  // Log at 'info' or 'warn' if status is >= 400, otherwise debug
  const level = response.status >= 400 ? "warn" : "debug"

  event.locals.logger[level](
    { status: response.status, duration: `${duration}ms` },
    "HOOKS: Request finished",
  )

  return response
}

// If a logged-in user visits the login page, send them to welcome page.
const redirectHandle: Handle = async ({ event, resolve }) => {
  const isRootPath = event.url.pathname === "/"
  const hasReturnTo = event.url.searchParams.has("returnTo")

  // ONLY redirect users who are on the root AND don't have a returnTo param
  if (isRootPath && !hasReturnTo) {
    const session = await event.locals.auth()

    if (hasLoggedInUserContext(session)) {
      event.locals.logger.debug(
        { userId: session?.user?.id },
        "HOOKS: Logged-in user on login page -> Redirecting to Welcome page.",
      )
      throw redirect(303, "/welcome")
    }
  }

  return resolve(event)
}

// If the route is protected, ensure the user is logged in.
const guardHandle: Handle = async ({ event, resolve }) => {
  if (isProtectedRoute(event.url.pathname)) {
    const session = await event.locals.auth()

    if (!hasLoggedInUserContext(session)) {
      redirectToLogin(event.url, event.locals.logger, "No user found")
    }
  }

  return resolve(event)
}

// sequence() executes these in order.
export const handle = sequence(
  setupHandle, // Setup Config and logger
  loggerHandle, // Observe Requests via logging
  authHandle, // Setup Authentication (this is imported on a custom Handler)
  redirectHandle, // Redirect users to Welcome page after login
  guardHandle, // Redirect to login in case user is not authenticated
)

// ----------------------------------------------------------
// Special HANDLES: on startup of the server and on error
// ----------------------------------------------------------

// --- INIT (Server Startup) ---
export const init = async () => {
  configLoader = setupConfigAndLogger()
  logger.info({ env: import.meta.env }, "Node environment.")

  try {
    const health = await callGrpc<HealthCheckResponse>((cb) =>
      healthClient.check({}, cb),
    )
    logger.info({ health }, "Backend health check passed.")
  } catch (err) {
    logger.error({ err }, "Backend health check failed on startup.")
  }
}

// --- ERROR HANDLER ---
export const handleError: HandleServerError = ({ error, event }) => {
  const errorId = crypto.randomUUID()
  // Safe access to logger, fallback to console if logger setup failed
  const log = event.locals.logger || logger

  log.error(
    { errorId, error, url: event.url.toString(), method: event.request.method },
    "An unhandled server error occurred.",
  )

  return {
    message: "An unexpected error occurred.",
    errorId,
  }
}
