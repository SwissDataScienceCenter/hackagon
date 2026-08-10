import { SvelteKitAuth } from "@auth/sveltekit"
import type { Logger } from "pino"
import type { RequestEvent } from "@sveltejs/kit"
import Keycloak from "@auth/sveltekit/providers/keycloak"
import type {
  CustomSession,
  JwtCallbackParams,
  SessionCallbackParams,
  CustomJWT,
} from "./auth.d"
import type { SvelteKitAuthConfig } from "@auth/sveltekit"
import type { AppConfig } from "$lib/server/settings"
import { assert } from "$lib/server/assert"

export const getAuthOptions = (
  config: AppConfig,
  parentLogger: Logger,
): SvelteKitAuthConfig => {
  assert(config, "Authentication configuration is missing.", parentLogger)

  const logger = parentLogger.child({ module: "Auth" })

  return {
    providers: [
      Keycloak({
        id: "keycloak",
        clientId: config.oidc.clientId,
        clientSecret: config.oidc.clientSecret,
        issuer: config.oidc.issuer,
        authorization: {
          params: {
            scope: "openid profile email",
            audience: config.oidc.audience,
            prompt: "login",
          },
        },
      }),
    ],
    // trustHost must be true when running behind a reverse proxy (production).
    // Safe to set true always since SvelteKit handles host validation.
    trustHost: true,
    debug: config.log?.forceDevLog ?? false, // Enable debug logs for development; can be toggled via config if needed
    session: {
      strategy: "jwt" as const,
    },
    callbacks: {
      // --- JWT Callback: Handles token creation and refresh ---
      async jwt(params: JwtCallbackParams): Promise<CustomJWT> {
        const token = params.token as CustomJWT
        const { account, profile } = params
        // Initial Sign-in (`account` is available)
        if (account && profile) {
          logger.info(
            { userId: profile.sub },
            "JWT Callback: Initial sign-in successful.",
          )
          // NOTE: Roles are NOT extracted from the Keycloak token. They are
          // context-dependent (e.g. admin on Hackathon A, participant on B)
          // and will be resolved via the backend user database per request.
          return {
            ...token, // Preserve basic JWT fields (sub, iat, etc.)
            accessToken: account.access_token,
            refreshToken: account.refresh_token,
            expiresAt: account.expires_at, // Use original expires_at (in seconds)
            userId: (profile.sub as string | undefined) ?? token.sub, // Store user ID
            error: undefined, // Clear error on successful login
          }
        }

        // Subsequent Requests: Refresh proactively before expiry so downstream
        // calls (gRPC etc.) don't race against a token that expires mid-flight.
        const REFRESH_BUFFER_SECONDS = 30
        const nowSeconds = Math.floor(Date.now() / 1000)
        if (nowSeconds < (token.expiresAt ?? 0) - REFRESH_BUFFER_SECONDS) {
          logger.debug("JWT Callback: Token is still valid.")
          return token
        }

        // Token expired or about to expire: Attempt Refresh
        logger.info(
          "JWT Callback: Token expired or expiring soon, attempting refresh...",
        )
        if (!token.refreshToken) {
          logger.error("JWT Callback: Refresh token request failed.")
          token.error = "RefreshTokenError"
          return token
        }

        try {
          const response = await fetch(
            `${config.oidc.issuer}/protocol/openid-connect/token`,
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: config.oidc.clientId,
                client_secret: config.oidc.clientSecret,
                grant_type: "refresh_token",
                refresh_token: token.refreshToken,
              }),
            },
          )

          const refreshedTokens = await response.json()

          if (!response.ok) {
            logger.error(
              { userId: token.userId, errorDetails: refreshedTokens },
              "JWT Callback: Refresh token request failed.",
            )
            throw new Error(
              refreshedTokens.error_description || "Refresh failed",
            )
          }

          logger.info("JWT Callback: Token refreshed successfully.")

          // Why `id_token` is neither stored nor carried forward: this object is
          // encrypted straight into the session cookie, and Auth.js splits that
          // cookie into chunks once the value passes 3936 bytes (@auth/core
          // ALLOWED_COOKIE_SIZE 4096, less 160 for attributes). Access + refresh
          // token alone encrypt to ~3.5 kB, so adding the ~1.2 kB id_token
          // pushed it to ~5 kB — two ~4 kB Set-Cookie headers, which overflows
          // a reverse proxy's default 4 kB response-header buffer and turns
          // every response into a 502. Nothing reads it, so nothing is lost.
          //
          // The destructure is what evicts it. Sessions minted before this fix
          // already carry `idToken`, and the spread below would re-encrypt it on
          // every refresh — leaving exactly the users who hit the 502 stuck
          // behind an oversized cookie until they cleared it by hand. It is off
          // the JWT type deliberately, so this cast is the only place that
          // admits the legacy field exists.
          const { idToken, ...carried } = token as CustomJWT & {
            idToken?: string
          }
          void idToken

          // Update token with new values
          return {
            ...carried, // Keep existing info like userId, organization, etc.
            accessToken: refreshedTokens.access_token,
            expiresAt:
              Math.floor(Date.now() / 1000) + refreshedTokens.expires_in,

            // Keycloak might rotate refresh tokens, update if provided
            refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
            error: undefined, // Clear any previous error
          }
        } catch (error: unknown) {
          logger.error(
            { error },
            "JWT Callback: Error refreshing access token.",
          )
          token.error = "RefreshTokenError" // Mark token with error
          // Don't return potentially sensitive error details, just the flag
          return token
        }
      },

      // --- Session Callback: Controls client-facing session object ---
      async session(params: SessionCallbackParams): Promise<CustomSession> {
        const session = params.session as CustomSession
        const customToken = params.token as CustomJWT

        session.accessToken = customToken.accessToken
        session.error = customToken.error

        if (session.user) {
          session.user.id = (customToken.userId ?? customToken.sub) as string
        }

        return session
      },
    },
    secret: config.oidc.authSecret, // Secret for JWT signing and encryption
    //debug: process.env.NODE_ENV !== 'production', // Enable logs in dev
    logger: {
      error: (error: unknown) => {
        logger.error({ error }, "Unhandled error caught by SvelteKitAuth")
      },
    },
  }
}

export const { handle, signIn, signOut } = SvelteKitAuth(
  async (event: RequestEvent) => {
    // Get config from locals
    const config = event.locals.config

    // Pass it to the options generator
    return getAuthOptions(config, event.locals.logger)
  },
)
