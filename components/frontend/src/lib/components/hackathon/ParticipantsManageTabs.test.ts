import { render, screen } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"

import ParticipantsManageTabs from "./ParticipantsManageTabs.svelte"

/*
 * Whether there is a tab bar at all, which is the only branch in here.
 *
 * `showWaitlist` is the caller's decision, not this component's — the roster
 * page composes it from the hackathon's visibility and the size of the queue
 * (see `waitlistsJoiners` in its load), and the waitlist page passes true
 * unconditionally so that a page reached by link never hides its own tab. What
 * is asserted here is what either answer renders.
 *
 * The all-or-nothing part is the point: a false leaves no lone "Participants"
 * chip behind, because a segmented control with one segment reads as a broken
 * one rather than as a choice.
 */

const props = {
  hackathonId: "h1",
  current: "roster" as const,
  confirmedCount: 12,
  waitingCount: 3,
  showWaitlist: true,
}

describe("ParticipantsManageTabs", () => {
  it("renders both halves when there is a waitlist to show", () => {
    render(ParticipantsManageTabs, props)

    expect(
      screen.getByRole("navigation", { name: "Participants" }),
    ).toBeTruthy()
    expect(screen.getByRole("link", { name: /Participants 12/ })).toBeTruthy()
    expect(screen.getByRole("link", { name: /Waitlist 3/ })).toBeTruthy()
  })

  it("renders nothing at all when the waitlist is not shown", () => {
    render(ParticipantsManageTabs, { ...props, showWaitlist: false })

    // Not "the waitlist chip is gone" — the roster's own chip goes with it, so
    // there is no navigation left to find.
    expect(screen.queryByRole("navigation")).toBeNull()
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("badges a non-empty queue and leaves an empty one plain", () => {
    const { container, unmount } = render(ParticipantsManageTabs, props)
    expect(container.querySelector(".badge-warning")).not.toBeNull()
    unmount()

    // A public hackathon keeps this tab at zero: there the waitlist is the
    // front door, so "0 waiting" is an answer. Nothing to chase, no warning.
    const empty = render(ParticipantsManageTabs, { ...props, waitingCount: 0 })
    expect(empty.container.querySelector(".badge-warning")).toBeNull()
    expect(screen.getByRole("link", { name: /Waitlist 0/ })).toBeTruthy()
  })

  it("marks the current half for assistive tech", () => {
    render(ParticipantsManageTabs, { ...props, current: "waitlist" })

    expect(
      screen
        .getByRole("link", { name: /Waitlist/ })
        .getAttribute("aria-current"),
    ).toBe("page")
    expect(
      screen
        .getByRole("link", { name: /Participants/ })
        .getAttribute("aria-current"),
    ).toBeNull()
  })
})
