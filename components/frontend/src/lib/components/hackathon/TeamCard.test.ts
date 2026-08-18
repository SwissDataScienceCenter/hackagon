import { cleanup, render, screen } from "@testing-library/svelte"
import { afterEach, describe, expect, it } from "vitest"

import TeamCard from "./TeamCard.svelte"

/*
 * The participant-facing Teams list (issue #182).
 *
 * This card used to draw an "Edit team" pencil on any row the viewer was a
 * member of. It carried no handler of any kind — no `onclick`, no `href`, no
 * form — and editing a team is done from the organiser's Manage Teams board,
 * which lives behind a route guard. So the ONE control this list offered a
 * participant was an organiser affordance that could not have worked.
 *
 * What replaces it is the fact the flag actually carries: which row is yours,
 * worded the way the submissions page words it.
 */

const props = {
  num: 1,
  title: "Sensor Dashboard",
  projectDescription: "Realtime charts for the field sensors",
  members: [{ name: "Bob Barker" }],
  moreInfoHref: "/my/hackathon/h1/teams",
}

afterEach(cleanup)

describe("TeamCard", () => {
  it("offers no edit control on the viewer's own team", () => {
    render(TeamCard, { ...props, isOwn: true })

    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull()
    expect(screen.queryByLabelText(/edit team/i)).toBeNull()
  })

  it("offers no edit control on anyone else's team either", () => {
    render(TeamCard, { ...props, isOwn: false })

    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull()
  })

  it("marks the viewer's own team", () => {
    // The positive control on the two absence assertions above: `isOwn` still
    // reaches the DOM, so those zeros are about the edit control and not about
    // a prop that stopped being rendered at all.
    render(TeamCard, { ...props, isOwn: true })

    expect(screen.getByText("Your team")).toBeTruthy()
  })

  it("does not mark a team the viewer is not on", () => {
    render(TeamCard, { ...props, isOwn: false })

    expect(screen.queryByText("Your team")).toBeNull()
  })

  it("keeps the one link the card is for", () => {
    render(TeamCard, { ...props, isOwn: false })

    expect(screen.getByRole("link", { name: "More Information" })).toBeTruthy()
  })
})
