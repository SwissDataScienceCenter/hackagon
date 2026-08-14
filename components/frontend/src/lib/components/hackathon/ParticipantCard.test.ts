import { cleanup, render, screen } from "@testing-library/svelte"
import { afterEach, describe, expect, it } from "vitest"

import ParticipantCard from "./ParticipantCard.svelte"

/*
 * The "View" control, which shipped going nowhere: it was handed
 * `#participant-<id>`, a same-page fragment `resolve()` matches to no route, so
 * clicking it changed the URL hash and stayed put. `Pathname` is not a type that
 * could have caught it either — the route tree's root `[slug]` route makes every
 * absolute path assignable — so the destination is asserted here instead, on the
 * rendered anchor, which is the only place the mistake was visible.
 */

afterEach(cleanup)

const view = () => screen.queryByRole("link", { name: /^View/ })

describe("ParticipantCard", () => {
  it("points View at the participant's page in this hackathon", () => {
    render(ParticipantCard, {
      name: "Alice Anderson",
      profileDetailsHref: "/my/hackathon/h1/participants/u1",
    })

    expect(view()).toHaveAttribute("href", "/my/hackathon/h1/participants/u1")
  })

  it("offers no View at all when there is nowhere to send the reader", () => {
    // The absence is the point, so the control renders here to prove the query
    // above finds one when it exists — an absence assertion with no positive
    // control agrees with everything.
    const { unmount } = render(ParticipantCard, {
      name: "Alice Anderson",
      profileDetailsHref: "/my/hackathon/h1/participants/u1",
    })
    expect(view()).not.toBeNull()
    unmount()

    render(ParticipantCard, { name: "Alice Anderson" })
    expect(view()).toBeNull()
  })

  it("names the person for a screen reader in TEXT, never an attribute", () => {
    // The replay tracker masks text nodes and ships attribute values verbatim,
    // so a name in an aria-label leaks on a page that lists everybody.
    render(ParticipantCard, {
      name: "Alice Anderson",
      profileDetailsHref: "/my/hackathon/h1/participants/u1",
    })

    const link = view()
    expect(link).not.toBeNull()
    expect(link!.getAttribute("aria-label")).toBeNull()
    expect(link!.textContent).toContain("Alice Anderson")
  })
})
