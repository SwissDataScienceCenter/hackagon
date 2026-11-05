import { render, screen } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"

import HackathonBreadcrumb from "./HackathonBreadcrumb.svelte"

const render_ = (props = {}) =>
  render(HackathonBreadcrumb, {
    hackathonName: "Data for Good Hackathon 2026",
    ...props,
  })

describe("HackathonBreadcrumb", () => {
  // The whole point: the name in full, which the sidebar header cut off.
  it("names the hackathon, then the section", () => {
    render_({ section: "Projects" })

    const parts = screen
      .getAllByRole("listitem")
      .map((li) => li.textContent?.trim())
    // The "/" between them is aria-hidden, so it is not a list item to a
    // screen reader — which is the reading this asserts.
    expect(parts).toEqual(["Data for Good Hackathon 2026", "Projects"])
  })

  // A statement of where the reader is, not a way around: the name linked to
  // Overview, which sent an organiser out of their own section.
  it("links nowhere", () => {
    render_({ section: "Manage Projects" })

    expect(screen.queryAllByRole("link")).toEqual([])
  })

  it("marks the section as the current page", () => {
    render_({ section: "Projects" })

    expect(screen.getByText("Projects").getAttribute("aria-current")).toBe(
      "page",
    )
  })

  it("ends at the hackathon on a route no entry claims", () => {
    render_()

    expect(screen.getAllByRole("listitem")).toHaveLength(1)
  })

  it("carries the padlock for a private hackathon", () => {
    render_({ section: "Projects", isPrivate: true })

    expect(screen.getByLabelText("Private")).toBeTruthy()
  })
})
