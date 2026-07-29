import { resolve as resolvePath } from "$app/paths"
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
import { createAuthorizedGrpc, healthClient } from "$lib/server/grpc/client"
import { ClientError, Status } from "nice-grpc-common"
import type { CustomSession } from "./auth.d"

// Global config state for the application.
let configLoader: ConfigLoader

// Routes are protected by default. Only routes matching PUBLIC_ROUTE_PATTERNS
// are accessible without authentication.
// Public hackathon marketing page only: /hackathon/<slug> — not /hackathon/<slug>/overview, etc.
// (Participant routes under (app)/(member)/hackathon/[slug]/... require login.)
// --- CONSTANTS ---
const PUBLIC_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/hackathon\/[^/]+\/?$/,
  /^\/signin($|\/)/,
  /^\/signout($|\/)/,
  /^\/auth($|\/)/,
  /^\/error($|\/)/,
]

export function isProtectedRoute(pathname: string): boolean {
  return !PUBLIC_ROUTE_PATTERNS.some((p) => p.test(pathname))
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

// Session + Guard + gRPC setup (single auth() call per request)
const sessionSetupHandle: Handle = async ({ event, resolve }) => {
  const session = (await event.locals.auth()) as CustomSession | null

  // Always store sanitized session (strip accessToken for client safety)
  if (session) {
    const { accessToken, ...clientSession } = session
    void accessToken
    event.locals.session = clientSession
  }

  if (isProtectedRoute(event.url.pathname)) {
    if (!hasLoggedInUserContext(session)) {
      redirectToLogin(event.url, event.locals.logger, "No user found")
    }

    // TODO [AUTHZ]: Role-based access control will be resolved via the backend
    // user database (roles are context-dependent, e.g. admin on one hackathon
    // but participant on another). When implemented, query the backend for the
    // user's role in the current context and gate access here.

    if (session?.error === "RefreshTokenError") {
      redirectToLogin(
        event.url,
        event.locals.logger,
        "Token refresh failed, re-authentication required",
      )
    }

    if (!session?.accessToken) {
      redirectToLogin(event.url, event.locals.logger, "No access token")
    }

    event.locals.grpc = createAuthorizedGrpc(session!.accessToken!)
    event.locals.logger.debug("HOOKS: Authorized gRPC clients created.")

    try {
      const resp = await event.locals.grpc.user.whoAmI({})
      event.locals.platformUser = resp.user ?? undefined
    } catch (err) {
      if (err instanceof ClientError && err.code === Status.NOT_FOUND) {
        event.locals.logger.info(
          "HOOKS: User not in DB, auto-registering via Register RPC.",
        )
        const regResp = await event.locals.grpc.user.register({})
        event.locals.platformUser = regResp.user ?? undefined
      } else if (
        err instanceof ClientError &&
        err.code === Status.UNAVAILABLE
      ) {
        event.locals.logger.warn(
          "HOOKS: Backend unavailable for WhoAmI, proceeding without platform user.",
        )
      } else {
        throw err
      }
    }
  }

  return resolve(event)
}

// If a logged-in user visits the root page (without returnTo), send them to the dashboard.
const redirectHandle: Handle = async ({ event, resolve }) => {
  const isRootPath = event.url.pathname === "/"
  const hasReturnTo = event.url.searchParams.has("returnTo")

  if (isRootPath && !hasReturnTo) {
    if (event.locals.session?.user?.id) {
      event.locals.logger.debug(
        { userId: event.locals.session.user.id },
        "HOOKS: Logged-in user on login page -> Redirecting to dashboard.",
      )
      throw redirect(303, resolvePath("/(app)/(member)/dashboard"))
    }
  }

  return resolve(event)
}

// sequence() executes these in order.
export const handle = sequence(
  setupHandle, // Setup Config and logger
  loggerHandle, // Observe Requests via logging
  authHandle, // Setup Authentication (this is imported on a custom Handler)
  sessionSetupHandle, // Sanitize session + guard protected routes + setup gRPC clients
  redirectHandle, // Logged-in users on / -> /dashboard (unless returnTo is present)
)

// ----------------------------------------------------------
// Special HANDLES: on startup of the server and on error
// ----------------------------------------------------------

// --- INIT (Server Startup) ---
export const init = async () => {
  configLoader = setupConfigAndLogger()
  logger.info({ env: import.meta.env }, "Node environment.")

  try {
    const health = await healthClient.check({})
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
