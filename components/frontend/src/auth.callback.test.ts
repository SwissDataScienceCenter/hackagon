import { describe, it, expect, vi, beforeEach, type Mock } from "vitest"
import { getAuthOptions } from "./auth"
import type { CustomJWT } from "./auth.d"
import { ConfigLoader } from "$lib/server/settings"
import type { Logger } from "pino"
import type { ProviderType } from "@auth/core/providers"
import type { JWT } from "@auth/core/jwt"

type AuthCallbacks = NonNullable<ReturnType<typeof getAuthOptions>["callbacks"]>
type JwtCallback = NonNullable<AuthCallbacks["jwt"]>
type JwtCallbackParams = Parameters<JwtCallback>[0]

// Mock logger
const mockLogger = {
  child: vi.fn().mockReturnThis(),
  fatal: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
} as unknown as Logger

// Mock the fetch
const mockFetch = vi.fn()

vi.mock("$lib/server/settings", () => {
  const mockConfig = {
    oidc: {
      clientSecret: "pb2nRrkLw4P1Czslopa5LbMc3A69Zx14ue8iOfX0hkA=",
      authSecret: "pb2nRrkLw4P1Czslopa5LbMc3A69Zx14ue8iOfX0hkA=",
    },
  }
  return {
    ConfigLoader: vi.fn().mockImplementation(() => ({
      load: vi.fn(), // no-op, never touches the filesystem
      get: vi.fn().mockReturnValue(mockConfig),
    })),
  }
})

describe("Auth.js jwt Callback", () => {
  let jwtCallback: JwtCallback

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
    mockFetch.mockClear()

    // Reset logger mocks
    ;(mockLogger.child as Mock).mockClear()
    ;(mockLogger.error as Mock).mockClear()

    const loader = new ConfigLoader()
    try {
      loader.load("./data/test/config")
    } catch (e) {
      console.log(e) // Will show the formatted issues from ValidationError
      throw e
    }

    const authOptions = getAuthOptions(loader.get(), mockLogger)

    // Get the jwt callback function
    jwtCallback = authOptions.callbacks!.jwt!
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("should save tokens on initial sign-in", async () => {
    const mockToken: CustomJWT = { sub: "user1" } // Base token
    const mockAccount = {
      access_token: "initial_access",
      id_token: "initial_id",
      refresh_token: "initial_refresh",
      expires_at: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
      provider: "keycloak",
      providerAccountId: "keycloak-user1",
      type: "oauth" as ProviderType,
    }
    const mockProfile = { organization: "test-org", sub: "user1" } // Add relevant profile fields
    const mockUser = { id: "user1", email: "test@example.com" }

    const result = (await jwtCallback({
      token: mockToken,
      user: mockUser,
      account: mockAccount,
      profile: mockProfile,
    })) as CustomJWT

    expect(result.accessToken).toBe("initial_access")
    expect(result.refreshToken).toBe("initial_refresh")
    expect(result.expiresAt).toBe(mockAccount.expires_at)
    expect(result.userId).toBe("user1")
    expect(result.error).toBeUndefined()
    // idToken and organization are intentionally not stored in the JWT
    // to keep the session cookie under the 4096 byte limit
    expect(result).not.toHaveProperty("idToken")
    expect(result.organization).toBeUndefined()
  })

  it("should return existing token if not expired", async () => {
    const mockToken: CustomJWT = {
      sub: "user1",
      accessToken: "valid_access",
      refreshToken: "valid_refresh",
      expiresAt: Math.floor(Date.now() / 1000) + 600, // Expires in 10 mins
      userId: "user1",
    }
    // No account on subsequent calls
    const result = (await jwtCallback({
      token: mockToken,
      account: null,
    } as JwtCallbackParams)) as CustomJWT

    expect(result).toBe(mockToken) // Should return the exact same object
    expect(mockFetch).not.toHaveBeenCalled() // Fetch should not be called
  })

  it("should proactively refresh if token expires within 30 seconds", async () => {
    const mockToken: CustomJWT = {
      sub: "user1",
      accessToken: "about_to_expire_access",
      refreshToken: "valid_refresh",
      expiresAt: Math.floor(Date.now() / 1000) + 15, // Expires in 15s (within 30s buffer)
      userId: "user1",
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "refreshed_access",
        id_token: "refreshed_id",
        expires_in: 3600,
        refresh_token: "rotated_refresh",
      }),
    } as Response)

    const result = (await jwtCallback({
      token: mockToken as JWT,
      account: null,
    } as JwtCallbackParams)) as CustomJWT

    expect(mockFetch).toHaveBeenCalledOnce()
    expect(result.accessToken).toBe("refreshed_access")
    expect(result.error).toBeUndefined()
  })

  it("should attempt refresh if token is expired", async () => {
    const mockToken = {
      sub: "user1",
      accessToken: "expired_access",
      refreshToken: "valid_refresh", // Need this to refresh
      expiresAt: Math.floor(Date.now() / 1000) - 60, // Expired 1 min ago
      userId: "user1",
      // A session minted before the cookie-size fix still carries this. Refresh
      // must evict it rather than spread it forward, or those sessions keep the
      // oversized cookie — and the 502 — forever.
      idToken: "stale_id",
    } as CustomJWT & { idToken?: string }

    // Mock a successful fetch response for refresh
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "refreshed_access",
        id_token: "refreshed_id",
        expires_in: 3600, // New token lasts 1 hour
        refresh_token: "rotated_refresh", // Simulate rotated token
      }),
    } as Response)

    const result = (await jwtCallback({
      token: mockToken as JWT,
      account: null,
    } as JwtCallbackParams)) as CustomJWT

    expect(mockFetch).toHaveBeenCalledOnce() // Ensure fetch was called
    expect(result.accessToken).toBe("refreshed_access")
    // Same budget as initial sign-in: the refreshed id_token must not be stored
    // either, or the cookie crosses the chunk threshold ~5 min into every
    // session and the proxy answers 502.
    expect(result).not.toHaveProperty("idToken")
    expect(result.refreshToken).toBe("rotated_refresh") // Check if refresh token updated
    expect(result.expiresAt).toBeGreaterThan(mockToken.expiresAt!)
    expect(result.error).toBeUndefined()
  })

  it("should set error flag if refresh fails", async () => {
    const mockToken: CustomJWT = {
      sub: "user1",
      accessToken: "expired_access",
      refreshToken: "invalid_refresh", // Assume this refresh token fails
      expiresAt: Math.floor(Date.now() / 1000) - 60, // Expired
      userId: "user1",
    }

    // Mock a failed fetch response
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: "invalid_grant",
        error_description: "Invalid refresh token",
      }),
    } as Response)

    const result = (await (
      jwtCallback as (params: JwtCallbackParams) => Promise<CustomJWT>
    )({
      token: mockToken,
      account: null,
    } as JwtCallbackParams)) as CustomJWT

    expect(mockFetch).toHaveBeenCalledOnce()
    expect(result.accessToken).toBe("expired_access") // Should retain old token info
    expect(result.error).toBe("RefreshTokenError") // Error flag should be set
  })

  it("should set error flag if refresh token is missing when expired", async () => {
    const mockToken: CustomJWT = {
      sub: "user1",
      accessToken: "expired_access",
      refreshToken: undefined, // Refresh token missing!
      expiresAt: Math.floor(Date.now() / 1000) - 60, // Expired
      userId: "user1",
    }

    const result = (await jwtCallback({
      token: mockToken,
      account: null,
    } as JwtCallbackParams)) as CustomJWT

    expect(mockFetch).not.toHaveBeenCalled() // Should not attempt fetch
    expect(result.error).toBe("RefreshTokenError")
  })
})
