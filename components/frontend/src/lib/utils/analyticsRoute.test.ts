import { describe, it, expect } from "vitest"
import {
  analyticsPath,
  analyticsUrl,
  analyticsReferrer,
} from "./analyticsRoute"

/*
 * These are absence-assertions ("no id reaches the analytics store"), and this
 * repo has been bitten three times by an absence-assertion that agreed with
 * everything (see .claude/CLAUDE.md, "Ways a test reported green while proving
 * nothing"). So every "the token is gone" case here is paired with a POSITIVE
 * CONTROL: the same call must still produce the route it claims to produce. A
 * function that returned "" for everything would pass the first half of each
 * pair and fail the second.
 */

describe("analyticsPath", () => {
  it("keeps the route template and drops the layout group", () => {
    expect(analyticsPath("/(app)/my/hackathon/[id]/teams")).toBe(
      "/my/hackathon/[id]/teams",
    )
    expect(analyticsPath("/(public)/hackathon/[id]")).toBe("/hackathon/[id]")
  })

  it("reports the root as /", () => {
    expect(analyticsPath("/(public)")).toBe("/")
    expect(analyticsPath("/")).toBe("/")
  })

  it("drops a param matcher but keeps the param", () => {
    expect(analyticsPath("/(public)/[slug=sitepage]")).toBe("/[slug]")
  })

  it("reports an unmatched route as such, never as its URL", () => {
    expect(analyticsPath(null)).toBe("/[unmatched]")
    expect(analyticsPath(undefined)).toBe("/[unmatched]")
    expect(analyticsPath("")).toBe("/[unmatched]")
  })

  it("cannot carry an invite token, because it never sees one", () => {
    // The route id is all this function is ever given — an invite URL and the
    // route it matched are different strings, and only the second one exists
    // here. Positive control on the same call: the ROUTE is still reported.
    const out = analyticsPath("/(public)/invite/[token]")
    expect(out).toBe("/invite/[token]")
    expect(out).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)
  })
})

describe("analyticsUrl", () => {
  it("is this origin plus the template", () => {
    expect(analyticsUrl("http://localhost:8081", "/(app)/dashboard")).toBe(
      "http://localhost:8081/dashboard",
    )
  })

  it("does not double the slash when the origin has a trailing one", () => {
    expect(analyticsUrl("http://localhost:8081/", "/(app)/dashboard")).toBe(
      "http://localhost:8081/dashboard",
    )
  })
})

describe("analyticsReferrer", () => {
  const origin = "http://localhost:8081"

  it("drops an internal referrer entirely", () => {
    // Positive control lives in the next test: if this function returned ""
    // unconditionally, "keeps an external origin" would fail.
    expect(
      analyticsReferrer(`${origin}/invite/abc-123-secret`, origin),
    ).toBe("")
  })

  it("keeps an external origin and nothing else of it", () => {
    expect(
      analyticsReferrer("https://github.com/some/repo?q=private", origin),
    ).toBe("https://github.com")
  })

  it("is empty for an absent or unparseable referrer", () => {
    expect(analyticsReferrer("", origin)).toBe("")
    expect(analyticsReferrer("not a url", origin)).toBe("")
  })
})
