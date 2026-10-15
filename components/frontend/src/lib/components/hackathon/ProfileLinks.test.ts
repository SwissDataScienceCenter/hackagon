import { render, screen } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"

import ProfileLinks from "./ProfileLinks.svelte"

/*
 * Only the links that are set, each opening off-site without handing this page
 * to the profile it opens.
 */

describe("ProfileLinks", () => {
  it("renders only the links that are set", () => {
    render(ProfileLinks, {
      links: {
        github: "https://github.com/octo",
        linkedin: "",
        renku: "https://renkulab.io/u/jane",
      },
    })

    const links = screen.getAllByRole("link")
    expect(links.map((a) => a.textContent?.trim())).toEqual(["GitHub", "Renku"])
    expect(
      screen.getByRole("link", { name: "GitHub" }).getAttribute("href"),
    ).toBe("https://github.com/octo")
  })

  it("opens each in a new tab without an opener", () => {
    render(ProfileLinks, {
      links: { github: "https://github.com/octo", linkedin: "", renku: "" },
    })

    const link = screen.getByRole("link", { name: "GitHub" })
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener noreferrer")
  })

  // The Account page's own view: which address was saved is the point there.
  it("shows the URL itself in the full variant, and only there", () => {
    const links = { github: "https://github.com/octo", linkedin: "", renku: "" }

    const { unmount } = render(ProfileLinks, { links })
    expect(screen.queryByText("https://github.com/octo")).toBeNull()
    unmount()

    render(ProfileLinks, { links, variant: "full" })
    expect(screen.getByText("https://github.com/octo")).toBeTruthy()
  })

  it("renders nothing when no link is set", () => {
    const { container } = render(ProfileLinks, {
      links: { github: "", linkedin: "", renku: "" },
    })

    expect(container.querySelector("ul")).toBeNull()
  })
})
