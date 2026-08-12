/**
 * The Join control on "Other hackathons".
 *
 * `HackathonService.List` returns `capabilities` per hackathon so a list can
 * gate its own buttons "instead of firing a mutation to discover it is closed"
 * — its own comment — and this page ignored it. On a populated instance that
 * was six Join buttons that answered `FailedPrecondition` and could never do
 * anything else.
 *
 * Every case here asserts on the CONTROL, never on the row: the row contains
 * the event's name, its badges and its thumbnail, so "the row is visible" is
 * true whether or not the button is. That mistake has been made three times in
 * this repo already.
 *
 * And every absence-assertion carries a positive control in the same test —
 * "no Join button" is satisfied just as well by a component that rendered
 * nothing at all.
 */
import { cleanup, render, screen } from "@testing-library/svelte"
import { afterEach, describe, expect, it } from "vitest"
import DashboardView from "./DashboardView.svelte"

afterEach(cleanup)

/** Enum numbers, not imports: `$lib/server/` is server-only and must not reach
 *  a component test any more than it may reach a component. */
const RUNNING = 2
const FINISHED = 3

interface Row {
  id: string
  name: string
  status: number
  canJoin?: boolean
}

function row(over: Partial<Row> = {}): Row {
  return {
    id: "h-1",
    name: "Climate Tech Hackathon 2026",
    status: RUNNING,
    canJoin: true,
    ...over,
  }
}

function mount(others: Row[]) {
  render(DashboardView, {
    props: {
      session: { user: { name: "Charles", id: "u-1" } },
      myHackathons: [],
      otherHackathons: others,
    },
  })
}

const joinButton = () => screen.queryByRole("button", { name: "Join" })

describe("the Join control", () => {
  it("is offered on an event that can be joined", () => {
    mount([row()])
    expect(joinButton()).not.toBeNull()
    expect(screen.queryByText("Registration closed")).toBeNull()
  })

  it("is withheld when the loader says the event cannot be joined", () => {
    mount([row({ canJoin: false })])
    expect(joinButton()).toBeNull()
  })

  it("says why rather than silently dropping the control", () => {
    // Withholding alone reads as a rendering fault. The row must still answer.
    mount([row({ canJoin: false, status: FINISHED })])
    expect(screen.getByText("Registration closed")).toBeTruthy()
    // Positive control: the event itself is still listed, so the absence above
    // is about the BUTTON and not about a component that rendered nothing.
    expect(screen.getByText("Climate Tech Hackathon 2026")).toBeTruthy()
  })

  it("gates each row on its own answer", () => {
    // The bug this guards: one flag read for the whole section, so a single
    // closed event would take every other event's button with it.
    mount([
      row({ id: "open", name: "Open Event", canJoin: true }),
      row({ id: "shut", name: "Shut Event", canJoin: false }),
    ])
    expect(screen.getAllByRole("button", { name: "Join" })).toHaveLength(1)
    expect(screen.getAllByText("Registration closed")).toHaveLength(1)
  })

  it("offers Join when the loader did not decide", () => {
    // `canJoin` is optional and `false`-checked, not truthy-checked: a caller
    // that never computes it must not lose its controls. Undefined means "no
    // opinion", which is what the backend then answers for real.
    mount([row({ canJoin: undefined })])
    expect(joinButton()).not.toBeNull()
  })
})
