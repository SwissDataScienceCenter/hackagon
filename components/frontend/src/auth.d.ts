// src/auth.d.ts
import type { DefaultSession } from "@auth/core/types"
import type { JWT as DefaultJWT } from "@auth/core/jwt"
import type { JWT } from "@auth/core/jwt"
import type { SvelteKitAuthConfig } from "@auth/sveltekit"
import type { Session, Profile } from "@auth/core/types"

// Augmentations
declare module "@auth/core/types" {
  interface Session {
    accessToken?: string
    error?: string
    user?: DefaultSession["user"] & {
      id?: string
      organization?: unknown
    }
  }
}

declare module "@auth/core/jwt" {
  interface JWT extends DefaultJWT {
    // Every field here is encrypted into the session cookie, which Auth.js
    // chunks past 3936 bytes. Keep it to what is actually read: the access
    // token (gRPC auth) and the refresh token (renewal). No id_token.
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    organization?: unknown
    error?: string
    userId?: string
  }
}

// Derived types (always in sync with Auth.js)

// JWT with augmented fields
export type CustomJWT = JWT

// Session with our augmented fields
export type CustomSession = Session

// Keycloak OIDC profile shape
export interface CustomProfile extends Profile {
  sub?: string | null
  organization?: unknown
}

// Derive callback param types from the config type itself
export type JwtCallbackParams = Parameters<
  NonNullable<NonNullable<SvelteKitAuthConfig["callbacks"]>["jwt"]>
>[0]

export type SessionCallbackParams = Parameters<
  NonNullable<NonNullable<SvelteKitAuthConfig["callbacks"]>["session"]>
>[0]
