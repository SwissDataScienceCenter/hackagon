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
            scope: "openid profile",
            audience: config.oidc.audience,
            prompt: "login",
          },
        },
      }),
    ],
    // FIXME: This is not good ?? @martin,@sabine can you check this?
    trustHost: true, // Set to false in production unless behind a trusted proxy handling SSL
    debug: true, // Enable debug logs for development; can be toggled via config if needed
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
          return {
            ...token, // Preserve basic JWT fields (sub, iat, etc.)
            accessToken: account.access_token,
            refreshToken: account.refresh_token,
            expiresAt: account.expires_at, // Use original expires_at (in seconds)
            userId: (profile.sub as string | undefined) ?? token.sub, // Store user ID
            error: undefined, // Clear error on successful login
          }
        }

        // Subsequent Requests: Token is still valid?
        // Compare expiry (seconds) with current time (seconds)
        // FIXME: Divide is crude here. Use a proper conversion to 1000
        if (Date.now() / 1000 < (token.expiresAt ?? 0)) {
          logger.debug("JWT Callback: Token is still valid.")
          return token
        }

        // Token Expired: Attempt Refresh
        logger.info("JWT Callback: Token expired, attempting refresh...")
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
          // Update token with new values
          return {
            ...token, // Keep existing info like userId, organization, etc.
            accessToken: refreshedTokens.access_token,
            idToken: refreshedTokens.id_token, // Keycloak often sends updated id_token
            // Calculate new expiry (seconds)
            // FIXME: Divide is crude here. Use a proper conversion to 1000
            expiresAt: Math.floor(
              Date.now() / 1000 + refreshedTokens.expires_in,
            ),

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
