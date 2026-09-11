import { describe, expect, it, vi, beforeEach } from "vitest"

const signIn = vi.fn()
vi.mock("@auth/sveltekit/client", () => ({
  signIn: (...a: unknown[]) => signIn(...a),
}))

import { startPasswordChange, UPDATE_PASSWORD_ACTION } from "./account"

/*
 * The shape of the call is the whole mechanism, and every part of it is load
 * bearing in a way that is invisible at the call site: `kc_action` has to be the
 * *third* argument, because that is the one @auth/core merges into the
 * authorization URL. Passed as part of the options object instead it would be
 * posted as a form field, Keycloak would never see it, and the user would land
 * on an ordinary sign-in that quietly did nothing.
 */
describe("startPasswordChange", () => {
  beforeEach(() => signIn.mockClear())

  it("asks Keycloak for the update-password action, in the third argument", () => {
    startPasswordChange("/account")

    expect(signIn).toHaveBeenCalledTimes(1)
    expect(signIn).toHaveBeenCalledWith(
      "keycloak",
      { callbackUrl: "/account" },
      { kc_action: "UPDATE_PASSWORD" },
    )
  })

  it("comes back where it was told to", () => {
    startPasswordChange("/somewhere/else?tab=2")

    expect(signIn).toHaveBeenCalledWith(
      "keycloak",
      { callbackUrl: "/somewhere/else?tab=2" },
      expect.anything(),
    )
  })

  // Spelled exactly as Keycloak's required action is, or Keycloak ignores the
  // parameter and the redirect degrades to a plain sign-in.
  it("names the action Keycloak actually registers", () => {
    expect(UPDATE_PASSWORD_ACTION).toBe("UPDATE_PASSWORD")
  })
})
