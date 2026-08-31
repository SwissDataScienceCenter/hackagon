import { describe, it, expect } from "vitest"
import { safeReturnTo } from "./returnTo"

describe("safeReturnTo", () => {
  it("keeps a same-site path, query string and all", () => {
    // The query string is half the destination for a filtered list or a form
    // step, and dropping it sends somebody to a page that is not the one they
    // were bounced off.
    expect(safeReturnTo("/dashboard")).toBe("/dashboard")
    expect(safeReturnTo("/register/abc")).toBe("/register/abc")
    expect(safeReturnTo("/my/hackathon/1/projects?page=3")).toBe(
      "/my/hackathon/1/projects?page=3",
    )
  })

  it("refuses another origin dressed as a path", () => {
    // The whole reason this function exists. `//host` is protocol-relative, and
    // browsers treat the backslash form identically — both leave our site while
    // looking like a path in a query string.
    for (const raw of [
      "//evil.example",
      "//evil.example/login",
      "/\\evil.example",
      "/\\/evil.example",
    ]) {
      expect(safeReturnTo(raw)).toBeUndefined()
    }
  })

  it("refuses anything that is not a path at all", () => {
    for (const raw of [
      "https://evil.example",
      "http://evil.example",
      "javascript:alert(1)",
      "dashboard",
      "../dashboard",
      " /dashboard",
    ]) {
      expect(safeReturnTo(raw)).toBeUndefined()
    }
  })

  it("treats a missing or empty parameter as nothing to return to", () => {
    // What `searchParams.get` hands back on a plain visit, so the caller can
    // pass it straight through.
    for (const raw of [null, undefined, ""]) {
      expect(safeReturnTo(raw)).toBeUndefined()
    }
  })
})
