import { describe, it, expect } from "vitest"
import {
  DEFAULT_LOGIN_DESTINATION,
  LOGIN_PATH,
  loginDestination,
  loginUrlFor,
  safeReturnTo,
} from "./returnTo"

// The two halves of the user-visible contract, and the one security property
// that holds them both up.
//
//   loginUrlFor      where an anonymous visitor is bounced TO, carrying where
//                    they were going.
//   loginDestination where a completed login lands: that deep link, else the
//                    dashboard.
//
// Both sides run through safeReturnTo, because either one is a redirect target
// and an unvalidated redirect target is an open redirect off the site.

describe("safeReturnTo", () => {
  it("accepts same-origin absolute paths", () => {
    expect(safeReturnTo("/dashboard")).toBe("/dashboard")
    expect(safeReturnTo("/my/hackathon/abc/manage")).toBe(
      "/my/hackathon/abc/manage",
    )
    expect(safeReturnTo("/manage/users?q=alice")).toBe("/manage/users?q=alice")
  })

  it("rejects anything that could leave the site", () => {
    for (const hostile of [
      "https://evil.example/",
      "http://evil.example/",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "evil.example",
    ]) {
      expect(safeReturnTo(hostile), `${hostile} must be rejected`).toBeNull()
    }
  })

  it("treats absent and empty as absent", () => {
    expect(safeReturnTo(null)).toBeNull()
    expect(safeReturnTo(undefined)).toBeNull()
    expect(safeReturnTo("")).toBeNull()
  })
})

describe("loginUrlFor", () => {
  it("parks the requested path on the interstitial", () => {
    expect(loginUrlFor("/my/hackathon/abc/manage")).toBe(
      `${LOGIN_PATH}?returnTo=%2Fmy%2Fhackathon%2Fabc%2Fmanage`,
    )
  })

  it("keeps the query string — a filtered list is a different page", () => {
    expect(loginUrlFor("/manage/users?role=admin")).toBe(
      `${LOGIN_PATH}?returnTo=%2Fmanage%2Fusers%3Frole%3Dadmin`,
    )
  })

  // Validated on the way IN as well as on the way out: without this the hostile
  // value is visible in the address bar for the whole time the visitor spends
  // reading the page, even though it would be discarded later.
  it("drops a destination that could leave the site", () => {
    expect(loginUrlFor("https://evil.example/")).toBe(LOGIN_PATH)
    expect(loginUrlFor("//evil.example")).toBe(LOGIN_PATH)
    expect(loginUrlFor(null)).toBe(LOGIN_PATH)
  })
})

describe("loginDestination", () => {
  it("returns the deep link when there is one", () => {
    expect(loginDestination("/my/hackathon/abc/manage")).toBe(
      "/my/hackathon/abc/manage",
    )
    expect(loginDestination("/invite/some-token")).toBe("/invite/some-token")
  })

  // The user-visible default: "bring these people to the dashboard unless they
  // have a link to this".
  it("falls back to the dashboard when nothing was parked", () => {
    expect(loginDestination(null)).toBe(DEFAULT_LOGIN_DESTINATION)
    expect(loginDestination(undefined)).toBe(DEFAULT_LOGIN_DESTINATION)
    expect(loginDestination("")).toBe(DEFAULT_LOGIN_DESTINATION)
  })

  it("never hands back an off-site destination", () => {
    expect(loginDestination("https://evil.example/")).toBe(
      DEFAULT_LOGIN_DESTINATION,
    )
    expect(loginDestination("//evil.example")).toBe(DEFAULT_LOGIN_DESTINATION)
    expect(loginDestination("/\\evil.example")).toBe(DEFAULT_LOGIN_DESTINATION)
  })

  // The interstitial exists to be left. Landing back on it would either bounce
  // the visitor onward a second time or park them on a countdown to a login they
  // already completed, and a nested ?returnTo= would do it as many times as
  // somebody cared to type.
  it("refuses to send anyone back to the interstitial", () => {
    expect(loginDestination(LOGIN_PATH)).toBe(DEFAULT_LOGIN_DESTINATION)
    expect(loginDestination(`${LOGIN_PATH}?returnTo=%2Fsignin`)).toBe(
      DEFAULT_LOGIN_DESTINATION,
    )
    expect(loginDestination(`${LOGIN_PATH}/anything`)).toBe(
      DEFAULT_LOGIN_DESTINATION,
    )
    // But a path that merely STARTS with those letters is a real page.
    expect(loginDestination("/signing-up")).toBe("/signing-up")
  })
})
