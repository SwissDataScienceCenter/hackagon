import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/svelte"
import AppFooter from "./AppFooter.svelte"
import { APP_VERSION } from "$lib/version"

describe("AppFooter", () => {
  it("shows the build version", () => {
    render(AppFooter)

    // Not a hard-coded string: the point is that the build-time stamp reaches
    // the DOM at all. A missing Vite `define` would leave this empty or throw.
    expect(APP_VERSION).toMatch(/^v\d+\.\d+\.\d+/)
    expect(screen.getByText(APP_VERSION)).toBeInTheDocument()
  })

  it("links every off-site destination absolutely, and safely", () => {
    const { container } = render(AppFooter)

    const external = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('a[href^="http"]'),
    )
    expect(external.length).toBeGreaterThan(0)

    // A footer link that leaves the app opens in a new tab, and anything with
    // `target=_blank` needs `noopener` or the new tab can reach back via
    // `window.opener`.
    for (const link of external) {
      expect(link).toHaveAttribute("target", "_blank")
      expect(link.getAttribute("rel") ?? "").toContain("noopener")
    }
  })

  it("points internal links only at routes that exist", () => {
    const { container } = render(AppFooter)

    // Unlike main, /hackathon, /about and /privacy/terms are real routes on
    // this branch (the public browse page and seeded SitePage slugs) — so,
    // unlike the footer this was ported from, they belong here rather than
    // pointing off-site.
    const internal = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'),
    ).map((a) => a.getAttribute("href"))

    expect(internal.length).toBeGreaterThan(0)
    for (const href of internal) {
      expect(["/", "/dashboard", "/hackathon", "/about", "/privacy", "/terms"]).toContain(
        href,
      )
    }
  })

  it("credits the parent institutions and the current year", () => {
    render(AppFooter)

    expect(screen.getByAltText("ETH Zurich")).toBeInTheDocument()
    expect(screen.getByAltText("EPFL")).toBeInTheDocument()
    expect(
      screen.getByText(
        new RegExp(`© ${new Date().getFullYear()} Swiss Data Science Center`),
      ),
    ).toBeInTheDocument()
  })
})
