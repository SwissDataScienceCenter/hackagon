import { describe, it, expect } from "vitest"
import { isProtectedRoute } from "./hooks.server"
import { reservedSlugs } from "$lib/utils/sitePageSlug"
import { LOGIN_PATH, loginUrlFor } from "$lib/utils/returnTo"

describe("isProtectedRoute", () => {
  it("should protect /manage routes", () => {
    expect(isProtectedRoute("/manage/users")).toBe(true)
    expect(isProtectedRoute("/manage/users/")).toBe(true)
    expect(isProtectedRoute("/manage/users/123")).toBe(true)
  })

  it("should protect the member hackathon view but not the public one", () => {
    expect(isProtectedRoute("/my/hackathon/abc/overview")).toBe(true)
    expect(isProtectedRoute("/my/hackathon/abc")).toBe(true)
    expect(isProtectedRoute("/hackathon/abc")).toBe(false)
    expect(isProtectedRoute("/hackathon/abc/")).toBe(false)
  })

  // Both of these were redirect loops in the wild: the route exists inside the
  // (app) group, but the guard read the path as public, so no gRPC client was
  // created, the group's own guard bounced to login, and hooks.server.ts sent
  // the signed-in user straight back to the page. Forever.
  it("protects routes that live in the (app) group", () => {
    expect(isProtectedRoute("/account")).toBe(true)
    expect(isProtectedRoute("/account/")).toBe(true)
    expect(isProtectedRoute("/dashboard")).toBe(true)
    expect(isProtectedRoute("/hackathon/create")).toBe(true)
    expect(isProtectedRoute("/register/some-hackathon-id")).toBe(true)
  })

  it("reserves every top-level segment the route tree owns", () => {
    // Derived from the tree, so a new route reserves itself. If this ever
    // shrinks, some route just became shadowable by a CMS page.
    for (const segment of [
      "account",
      "dashboard",
      "hackathon",
      "manage",
      "my",
      "register",
      // The sign-in interstitial. It only became route-owned when it gained a
      // +page.svelte — before that the segment was derivable by nothing, and a
      // CMS page called "signin" would have been offered the URL the login
      // flow bounces every anonymous visitor to.
      "signin",
    ]) {
      expect(reservedSlugs.has(segment), `${segment} must be reserved`).toBe(
        true,
      )
    }
  })

  it("should protect unknown MULTI-segment routes by default", () => {
    expect(isProtectedRoute("/some/new/page")).toBe(true)
    expect(isProtectedRoute("/settings/profile")).toBe(true)
  })

  // Deliberate: a one-segment path that no route owns is a candidate SitePage
  // (admins create those at runtime, and the footer links reach them before
  // login). Letting it through is what makes /about work without a code change
  // per page; an unknown slug still 404s at the loader.
  it("lets unknown single-segment paths through as candidate SitePages", () => {
    expect(isProtectedRoute("/about")).toBe(false)
    expect(isProtectedRoute("/privacy")).toBe(false)
    expect(isProtectedRoute("/welcome")).toBe(false)
    expect(isProtectedRoute("/settings")).toBe(false)
  })

  it("should not protect public routes", () => {
    expect(isProtectedRoute("/")).toBe(false)
    expect(isProtectedRoute("/signin")).toBe(false)
    expect(isProtectedRoute("/signout")).toBe(false)
    expect(isProtectedRoute("/auth")).toBe(false)
    expect(isProtectedRoute("/error")).toBe(false)
  })

  // The interstitial is where the guard SENDS an anonymous visitor. If it were
  // ever protected the guard would send them to a page that bounces them to
  // itself — an infinite redirect on the one route whose job is to end one.
  // Asserted against the constant the guard actually redirects to, so renaming
  // the route cannot leave this test agreeing with a path nothing uses.
  it("never protects the page the guard bounces anonymous visitors to", () => {
    expect(isProtectedRoute(LOGIN_PATH)).toBe(false)
    expect(isProtectedRoute(`${LOGIN_PATH}/`)).toBe(false)
    const parked = loginUrlFor("/my/hackathon/abc/manage")
    expect(isProtectedRoute(new URL(parked, "http://x").pathname)).toBe(false)
  })
})
