import { render, screen } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"

import CapabilitiesPanel from "./CapabilitiesPanel.svelte"

/*
 * The Settings switches as the steps of running a hackathon, with the screens
 * between them. Raw enum numbers: REGISTER=1, PROPOSE_PROJECTS=2,
 * SET_TEAM_PREFERENCES=3, CREATE_PROJECT_SUBMISSIONS=4, VOTE=5,
 * VIEW_RESULTS=6, VIEW_TEAMS=7.
 */

const all = [1, 2, 3, 7, 4, 5, 6].map((value) => ({ value, enabled: false }))

function renderPanel(overrides = {}) {
  return render(CapabilitiesPanel, {
    hackathonId: "h1",
    isPrivate: false,
    hasState: true,
    capabilities: all,
    ...overrides,
  })
}

const link = (name: string) => screen.queryByRole("link", { name })
const box = (name: string) => screen.getByRole("checkbox", { name })

describe("CapabilitiesPanel", () => {
  it("lists the steps in the order a hackathon runs", () => {
    renderPanel()

    const titles = screen
      .getAllByRole("heading", { level: 4 })
      .map((h) => h.textContent?.replace(/^\s*\d+\.\s*/, "").trim())
    expect(titles).toEqual([
      "Register",
      "Projects",
      "Project preferences",
      "Team assignments",
      "Hacking starts",
      "Set up voting",
      "Voting starts",
      "Publish results",
    ])
    expect(screen.getAllByRole("checkbox")).toHaveLength(7)
  })

  it("names each switch for the organizer, on the right capability", () => {
    renderPanel()

    expect(box("Open registration")).toHaveAttribute("value", "1")
    expect(box("Participants can propose projects")).toHaveAttribute(
      "value",
      "2",
    )
    expect(box("Participants can voice preferences")).toHaveAttribute(
      "value",
      "3",
    )
    expect(box("Participants can see teams")).toHaveAttribute("value", "7")
    expect(box("Participants can submit for their team")).toHaveAttribute(
      "value",
      "4",
    )
    expect(box("Participants can vote")).toHaveAttribute("value", "5")
    expect(box("Publish results")).toHaveAttribute("value", "6")
  })

  it("links the steps that are screens, not switches", () => {
    renderPanel()

    expect(link("Registration form →")).toHaveAttribute(
      "href",
      "/my/hackathon/h1/manage/forms/registration",
    )
    expect(link("Manage Projects →")).toHaveAttribute(
      "href",
      "/my/hackathon/h1/projects/manage",
    )
    expect(link("Manage Teams →")).toHaveAttribute(
      "href",
      "/my/hackathon/h1/teams/manage",
    )
    expect(link("Set up voting →")).toHaveAttribute(
      "href",
      "/my/hackathon/h1/voting/manage",
    )
    // Publishing is locked until the results are final, made so there.
    expect(link("Manage Voting →")).toHaveAttribute(
      "href",
      "/my/hackathon/h1/voting/manage",
    )
  })

  // Every join waits for approval, public or private.
  it("sends registration to approving people, either way", () => {
    for (const isPrivate of [false, true]) {
      const { unmount } = renderPanel({ isPrivate })

      expect(link("Manage Participants →")).toHaveAttribute(
        "href",
        "/my/hackathon/h1/participants/manage",
      )
      unmount()
    }
  })

  it("says anyone can join a public hackathon, with no invitation link", () => {
    renderPanel()

    expect(screen.getByText(/anyone can find it and join/)).toBeInTheDocument()
    expect(link("Invitation links →")).toBeNull()
  })

  it("points a private hackathon's registration at its invitation links", () => {
    renderPanel({ isPrivate: true })

    expect(screen.getByText(/send invitation links/)).toBeInTheDocument()
    expect(link("Invitation links →")).toHaveAttribute(
      "href",
      "/my/hackathon/h1/manage/invites",
    )
  })

  // A switch the backend adds before a step names it must still be settable.
  it("keeps a capability no step names, under Other", () => {
    renderPanel({ capabilities: [...all, { value: 99, enabled: false }] })

    expect(screen.getByText("Other")).toBeInTheDocument()
    expect(screen.getAllByRole("checkbox")).toHaveLength(8)
  })
})
