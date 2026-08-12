/**
 * The organiser's switches, mounted.
 *
 * The table's own tests prove the four states have four distinct words. What is
 * only true once mounted is that those words REACH THE SCREEN — the panel used
 * to take a boolean per capability, computed in a loader as `state === OPEN`,
 * and three of our four states arrived as the same unticked box. A table with
 * four distinct entries feeding a component that renders two of them would pass
 * every test in `capability.test.ts`.
 *
 * So the assertions here are on the element that STATES each capability's
 * state, never on the row that contains it: the row holds a checkbox, a label,
 * a description and the state, and "the row mentions Open" is true of a row
 * whose switch says nothing of the kind. Each one is checked for not containing
 * the checkbox, which is the mechanical form of "this is not the container".
 */

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/svelte"
import CapabilitiesPanel from "./CapabilitiesPanel.svelte"
import {
  CapabilityState,
  capabilityDescription,
  capabilityLabel,
  capabilitySubject,
} from "$lib/utils/capability"

// No auto-cleanup is configured, so a second render would leave two panels
// mounted and every query would be ambiguous.
afterEach(cleanup)

const REGISTER = 1
const PROPOSE = 2
const SUBMISSIONS = 4
const VOTE = 5

/** One row of each state, so nothing can pass by only ever being on or off. */
const FOUR_STATES = [
  { capability: REGISTER, state: CapabilityState.OPEN },
  { capability: PROPOSE, state: CapabilityState.CLOSED },
  {
    capability: SUBMISSIONS,
    state: CapabilityState.COMING,
    opensAt: new Date(2026, 7, 12, 9, 0),
  },
  { capability: VOTE, state: CapabilityState.UNGOVERNED },
]

function mount(
  capabilities: { capability: number; state: number; opensAt?: Date }[],
  unmet: number[] = [],
) {
  render(CapabilitiesPanel, {
    props: { currentPhaseName: "Hacking", capabilities, unmet },
  })
}

/** The `<label>` one capability's switch lives in, found by its own checkbox. */
function row(capability: number): HTMLElement {
  const box = document.querySelector(
    `input[name=capabilities][value="${capability}"]`,
  )
  if (!box) throw new Error(`no switch rendered for capability ${capability}`)
  const label = box.closest("label")
  if (!label) throw new Error(`capability ${capability} has no row`)

  return label as HTMLElement
}

/**
 * The element inside one row whose OWN text is the state, and nothing else.
 *
 * An exact-text query cannot match the row: the row's text also carries the
 * label, the description and the note. The checkbox assertion says the same
 * thing a second way, so a future markup change that widened this locator back
 * out to the container fails here rather than passing quietly.
 */
function statedState(capability: number, text: string): HTMLElement {
  const el = within(row(capability)).getByText(text, { exact: true })
  expect(
    el.querySelector("input"),
    "the state was read off a container holding the switch, not off the badge",
  ).toBeNull()

  return el
}

describe("the four capability states", () => {
  it("states a different thing for each of the four", () => {
    mount(FOUR_STATES)

    // Each is asserted on its own badge, by the exact words that state it.
    expect(statedState(REGISTER, "Open")).toBeInTheDocument()
    expect(statedState(PROPOSE, "Closed")).toBeInTheDocument()
    expect(statedState(SUBMISSIONS, "Opens 12 Aug")).toBeInTheDocument()
    expect(statedState(VOTE, "Not governed")).toBeInTheDocument()
  })

  it("uses four distinct words, so no two states read alike", () => {
    // The claim a two-state flattening would fail and nothing else would: it is
    // not enough that each state has SOME text, it must differ from the others.
    mount(FOUR_STATES)

    const rendered = FOUR_STATES.map((c) => {
      const badge = within(row(c.capability)).getByText(
        /^(Open|Closed|Opens .+|Not governed)$/,
      )

      return badge.textContent?.trim()
    })
    expect(new Set(rendered).size).toBe(4)
  })

  it("explains each state in its own sentence", () => {
    mount(FOUR_STATES)

    // The badge is three words; the sentence is what tells an organiser that a
    // scheduled capability will switch itself on and an ungoverned one is
    // already permitted.
    expect(
      within(row(SUBMISSIONS)).getByText(/switches on by itself/),
    ).toBeInTheDocument()
    expect(
      within(row(VOTE)).getByText(/the server allows it/),
    ).toBeInTheDocument()
    expect(
      within(row(PROPOSE)).getByText(/nothing will change that on its own/),
    ).toBeInTheDocument()
    expect(
      within(row(REGISTER)).getByText(/Participants can do this now/),
    ).toBeInTheDocument()
  })

  it("ticks the box only for the capability whose flag is stored on", () => {
    // The checkbox reflects the stored flag, because that is the only thing
    // `SetCapabilities` writes. UNGOVERNED is permitted and still unticked —
    // which is exactly why the state line has to exist beside it.
    mount(FOUR_STATES)

    expect(row(REGISTER).querySelector("input")).toBeChecked()
    expect(row(PROPOSE).querySelector("input")).not.toBeChecked()
    expect(row(SUBMISSIONS).querySelector("input")).not.toBeChecked()
    expect(row(VOTE).querySelector("input")).not.toBeChecked()
  })

  it("counts down to a scheduled opening rather than calling it closed", () => {
    mount(FOUR_STATES)

    // "Opens 12 Aug" and "Closed" must not be the same answer — a date is the
    // reason COMING is a state of its own.
    const coming = within(row(SUBMISSIONS)).getByText(/^Opens /)
    expect(coming.textContent).not.toBe("Closed")
    expect(within(row(SUBMISSIONS)).queryByText("Closed")).toBeNull()
  })
})

describe("capabilities with no stored row", () => {
  it("warns that the server allows them and will refuse the save", () => {
    // `SetCapabilities` answers NotFound for a capability with no row and
    // refuses the WHOLE batch, and the form posts all six. An organiser should
    // read that here rather than deduce it from a 404.
    mount(FOUR_STATES)

    const warning = screen.getByText(/no stored setting on this hackathon/)
    expect(warning).toHaveTextContent(capabilitySubject(VOTE) as string)
    expect(warning).toHaveTextContent(/will refuse to save/)
  })

  it("says nothing when every capability has a row", () => {
    // The positive control for the assertion above: without it, a warning that
    // never rendered at all would satisfy "it warns when ungoverned".
    mount(FOUR_STATES.filter((c) => c.state !== CapabilityState.UNGOVERNED))

    expect(screen.queryByText(/no stored setting on this hackathon/)).toBeNull()
  })
})

describe("what each switch is for", () => {
  it("names and explains every capability it renders", () => {
    // Ported from main: six terms with nothing beside them read as settings,
    // when what is being decided is what everyone here may do.
    mount(FOUR_STATES)

    for (const c of FOUR_STATES) {
      const scope = within(row(c.capability))
      expect(
        scope.getByText(capabilityLabel(c.capability) as string, {
          exact: true,
        }),
      ).toBeInTheDocument()
      expect(
        scope.getByText(capabilityDescription(c.capability) as string, {
          exact: true,
        }),
      ).toBeInTheDocument()
    }
  })

  it("does not promise that phases leave the switches alone", () => {
    // Main's panel says "Moving between phases never changes them", which is
    // true of main's inert phases and false here: a capability names the phase
    // it opens in and `AdvancePhase` switches exactly those.
    mount(FOUR_STATES)

    expect(screen.queryByText(/never changes them/)).toBeNull()
    expect(screen.getByText(/moves WITH the timeline/)).toBeInTheDocument()
  })

  it("drops a capability this build cannot name", () => {
    mount([{ capability: 99, state: CapabilityState.OPEN }, ...FOUR_STATES])

    expect(document.querySelectorAll("input[name=capabilities]")).toHaveLength(
      FOUR_STATES.length,
    )
  })
})

describe("with no rows at all", () => {
  it("offers no switches and says why", () => {
    mount([])

    expect(document.querySelector("input[name=capabilities]")).toBeNull()
    expect(
      screen.getByText(/No capability settings were loaded/),
    ).toBeInTheDocument()
  })
})
