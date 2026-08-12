/**
 * What a participant is told they can do, mounted.
 *
 * This card deliberately answers with THREE outcomes for the four states —
 * OPEN and UNGOVERNED are both "go ahead", COMING is "not yet", CLOSED is left
 * out — because the reason one capability has a stored row and another does not
 * is the organiser's business. That is a decision, not a flattening, and the
 * difference is that the organiser's `CapabilitiesPanel` still tells all four
 * apart. Both halves are pinned, here and in `CapabilitiesPanel.test.ts`.
 *
 * The CLOSED case is an absence assertion, so it carries a positive control:
 * the same capability rendered OPEN must produce the words the closed case
 * claims are missing. Without that, a card that rendered nothing at all would
 * agree with every "it does not say X" in this file.
 */

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/svelte"
import CurrentStateCard from "./CurrentStateCard.svelte"
import { CapabilityState, capabilityAction } from "$lib/utils/capability"

afterEach(cleanup)

const REGISTER = 1
const PROPOSE = 2
const SUBMISSIONS = 4
const VOTE = 5

function mount(
  capabilities: { capability: number; state: number; opensAt?: Date }[],
) {
  render(CurrentStateCard, {
    props: { hackathonId: "h1", capabilities, currentPhaseName: "Hacking" },
  })
}

/** The list under one heading. The headings are the card's two claims. */
function listUnder(heading: string): HTMLElement {
  const label = screen.getByText(heading, { exact: true })
  const list = label.parentElement?.querySelector("ul")
  if (!list) throw new Error(`no list under "${heading}"`)

  return list as HTMLElement
}

describe("what a participant may do now", () => {
  it("offers an open capability as a link to the page that does it", () => {
    mount([{ capability: PROPOSE, state: CapabilityState.OPEN }])

    const link = within(listUnder("You can now")).getByRole("link", {
      name: new RegExp(capabilityAction(PROPOSE) as string),
    })
    expect(link).toHaveAttribute(
      "href",
      "/my/hackathon/h1/projects/proposals/propose",
    )
  })

  it("offers an ungoverned capability too, because the server allows it", () => {
    // `capability.State.Allowed` returns true for ungoverned. A card that
    // compared against OPEN alone would tell someone they cannot do a thing the
    // server will happily let them do.
    mount([{ capability: VOTE, state: CapabilityState.UNGOVERNED }])

    expect(
      within(listUnder("You can now")).getByRole("link", {
        name: new RegExp(capabilityAction(VOTE) as string),
      }),
    ).toBeInTheDocument()
  })

  it("shows a capability with no page of its own as a badge, not a link", () => {
    // Registering is behind whoever is reading this card, so linking to the
    // join flow would be a link backwards.
    mount([{ capability: REGISTER, state: CapabilityState.OPEN }])

    const list = listUnder("You can now")
    expect(within(list).queryByRole("link")).toBeNull()
    expect(
      within(list).getByText(capabilityAction(REGISTER) as string, {
        exact: true,
      }),
    ).toBeInTheDocument()
  })
})

describe("what is not open yet", () => {
  it("separates a scheduled capability from an open one, with its date", () => {
    mount([
      { capability: PROPOSE, state: CapabilityState.OPEN },
      {
        capability: SUBMISSIONS,
        state: CapabilityState.COMING,
        opensAt: new Date(2026, 7, 12, 9, 0),
      },
    ])

    const coming = within(listUnder("Not open yet")).getByText(/Turn work in/)
    expect(coming).toHaveTextContent("Opens 12 Aug")
    // And it is NOT in the other list — "not yet" and "go ahead" are the two
    // answers this card exists to keep apart.
    expect(
      within(listUnder("You can now")).queryByText(/Turn work in/),
    ).toBeNull()
  })

  it("says what it knows when the opening has no date", () => {
    mount([{ capability: SUBMISSIONS, state: CapabilityState.COMING }])

    expect(
      within(listUnder("Not open yet")).getByText(/Opens later/),
    ).toBeInTheDocument()
  })
})

describe("what is over", () => {
  it("leaves a closed capability out of both lists", () => {
    mount([
      { capability: PROPOSE, state: CapabilityState.OPEN },
      { capability: SUBMISSIONS, state: CapabilityState.CLOSED },
    ])

    expect(screen.queryByText(/Turn work in/)).toBeNull()
    // The positive control: the SAME words do render when that capability is
    // open, so the absence above is about the state and not about the card
    // having failed to render anything.
    cleanup()
    mount([{ capability: SUBMISSIONS, state: CapabilityState.OPEN }])
    expect(screen.getByText(/Turn work in/)).toBeInTheDocument()
  })

  it("says nothing rather than claiming nothing is open", () => {
    // Every capability closed is not the same claim as "no schedule", but the
    // card has nothing actionable either way and a list of things nobody can do
    // is not news.
    mount([{ capability: PROPOSE, state: CapabilityState.CLOSED }])

    expect(screen.queryByText("You can now")).toBeNull()
    expect(screen.queryByText("Not open yet")).toBeNull()
    expect(screen.getByText(/has not published a schedule/)).toBeInTheDocument()
  })
})

describe("capabilities this build does not know", () => {
  it("leaves an unnamed capability out rather than guessing a name", () => {
    mount([
      { capability: 99, state: CapabilityState.OPEN },
      { capability: PROPOSE, state: CapabilityState.OPEN },
    ])

    expect(
      within(listUnder("You can now")).getAllByRole("listitem"),
    ).toHaveLength(1)
  })
})
