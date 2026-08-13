/**
 * The Manage Hackathon hub, as a claim about where its tiles come from.
 *
 * The hub says in a comment that it reads `manageNav` "rather than listed again
 * here, so an entry added to the sidebar reaches these tiles too and is never
 * described in two places". That is a property, not a style note: a later edit
 * could hand-list the tiles, keep every current entry, and look correct in
 * review — the duplication only shows up the day someone adds an eleventh
 * organiser destination and it appears in the sidebar and nowhere else.
 *
 * So the property is asserted directly. `manageNav` is mocked to return the real
 * list PLUS one entry that exists nowhere in the app, and the hub has to render
 * it without this file's subject ever being edited.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/svelte"
import type { ComponentProps } from "svelte"
import Sparkles from "lucide-svelte/icons/sparkles"
import type { NavItem } from "$lib/navigation"

/** A destination that does not exist. Nothing but derivation can render it. */
const INVENTED: NavItem = {
  id: "manage:invented",
  label: "Invented Destination",
  icon: Sparkles,
  href: "/my/hackathon/h1/invented",
  description: "Added by the test, never by the page.",
  // Badge text deliberately shares no words with anything else on this page.
  // "3 waiting" was the first choice and made "no approval prompt when nobody is
  // waiting" pass against this tile instead — a fixture that answers the
  // assertion it was not written for.
  badge: "Beta",
  badgeVariant: "badge-warning",
}

vi.mock("$lib/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("$lib/navigation")>()

  return {
    ...actual,
    manageNav: (...args: Parameters<typeof actual.manageNav>) => {
      const real = actual.manageNav(...args)

      // Empty stays empty: a participant must not gain a tile from the mock, or
      // the "no section for a member" case below would be testing the mock.
      return real.length === 0 ? real : [...real, INVENTED]
    },
  }
})

import { manageNav } from "$lib/navigation"
import ManagePage from "./+page.svelte"

const OWNER = 1
const MEMBER = 2

const owner = { role: OWNER, isWaiting: false }

const phase = (id: string, name: string) => ({
  id,
  name,
  startsAt: new Date("2026-03-01T09:00:00Z"),
  endsAt: new Date("2026-03-02T17:00:00Z"),
})

function data(overrides: Record<string, unknown> = {}) {
  return {
    hackathonId: "h1",
    hackathonName: "ORD Hackathon",
    myMembership: owner,
    isGlobalAdmin: false,
    declared: false,
    currentPhase: null,
    nextPhase: null,
    // As `Hackathon.capabilities` arrives — OPEN is 2. The panel takes the rows
    // rather than a boolean projection; see CapabilitiesPanel.
    capabilities: [{ capability: 1, state: 2 }],
    unmet: [],
    waitingCount: 0,
    ...overrides,
  }
}

/** Every tile in the "Manage" grid, by its heading text. */
function tileLabels(): string[] {
  return screen
    .getAllByRole("link")
    .map((a) => a.querySelector("span > span")?.textContent?.trim() ?? "")
    .filter(Boolean)
}

// `PageData` comes from SvelteKit's generated `./$types`, which carries a great
// deal this page never reads (the whole layout tree). The shape under test is
// what `+page.server.ts` returns, built by `data()` above, so the props are cast
// once here rather than each fixture being widened to satisfy the generated type.
const mount = (overrides: Record<string, unknown> = {}) =>
  render(ManagePage, {
    data: data(overrides),
    form: null,
  } as unknown as ComponentProps<typeof ManagePage>)

afterEach(cleanup)

describe("the Manage Hackathon hub's tiles", () => {
  // The property. If this file's subject ever hand-lists its tiles, the invented
  // entry stops appearing and this fails — which is the only moment the
  // duplication is visible.
  it("renders an entry added to manageNav without the page being edited", () => {
    mount()

    const tile = screen.getByRole("link", { name: /Invented Destination/ })
    expect(tile).toHaveAttribute("href", "/my/hackathon/h1/invented")
  })

  // Equality in both directions, which "the invented one is there" alone does
  // not give: a page that rendered its own list PLUS whatever manageNav returned
  // would pass the test above.
  it("renders exactly manageNav's entries, minus its own", () => {
    mount()

    const expected = manageNav("h1", owner, false)
      .filter((i) => i.id !== "manage:hackathon")
      .map((i) => i.label)

    expect(expected.length).toBeGreaterThan(1)
    expect(tileLabels()).toEqual(expected)
  })

  // The tile grid is reached FROM this page, so a tile leading back to it is a
  // link to where you already are — the dead-link shape this nav fixed once.
  it("leaves out its own entry", () => {
    mount()

    expect(tileLabels()).not.toContain("Manage Hackathon")
  })

  // Named one at a time rather than counted: these are the entries main's Manage
  // panel does not have, and the whole point of this port was to adopt main's
  // hub without losing them.
  it("gives every entry this branch has that main does not a tile", () => {
    mount()

    for (const label of [
      "Prizes",
      "Deadlines",
      "Manage Forms",
      "Notifications",
      "Invitation Links",
      "New Phase",
    ]) {
      expect(
        tileLabels(),
        `"${label}" is an organiser destination main's panel does not have`,
      ).toContain(label)
    }
  })

  // Sidebar rows have always rendered `NavItem.badge`; the tiles used to drop
  // it, so an entry that carried a state chip lost it on the way here.
  it("carries an entry's own state badge onto its tile", () => {
    mount()

    expect(screen.getByText("Beta")).toHaveClass("badge", "badge-warning")
  })

  it("describes a tile from the entry rather than from the page", () => {
    mount()

    expect(
      screen.getByText("Added by the test, never by the page."),
    ).toBeInTheDocument()
  })
})

describe("the hub's heading actions", () => {
  it("offers Edit details to a confirmed owner, nested under manage", () => {
    mount()

    expect(screen.getByRole("link", { name: /Edit details/ })).toHaveAttribute(
      "href",
      "/my/hackathon/h1/manage/edit",
    )
  })

  // The page's own gate is the broader owner-or-admin, so a waitlisted owner
  // gets here; `hackathon:write` additionally wants them confirmed, and offering
  // a form that then refuses is worse than not offering it.
  it("withholds Edit details from a waitlisted owner who may still manage", () => {
    mount({ myMembership: { role: OWNER, isWaiting: true } })

    expect(screen.queryByRole("link", { name: /Edit details/ })).toBeNull()
    // The control, so "no link" cannot pass because the page rendered nothing.
    expect(tileLabels().length).toBeGreaterThan(1)
  })

  // Absent rather than "0 waiting": a readout nobody has to act on becomes
  // furniture, and this is the one number on the page that asks for something.
  it("shows no approval prompt when nobody is waiting", () => {
    mount({ waitingCount: 0 })

    expect(screen.queryByRole("link", { name: /waiting/ })).toBeNull()
  })

  it("prompts for the waiting queue and links where approving happens", () => {
    mount({ waitingCount: 4 })

    expect(
      screen.getByRole("link", { name: /Review 4 waiting/ }),
    ).toHaveAttribute("href", "/my/hackathon/h1/participants")
  })
})

// All three are the same POST; what differs is which phase it writes, which a
// single "Advance to X" label collapsed into one and got wrong in the middle
// case — it offered to advance PAST the phase the dates say is running.
describe("the hub's one phase action", () => {
  const submitLabel = () =>
    screen
      .getAllByRole("button")
      .map((b) => b.textContent?.trim() ?? "")
      .find((t) => /Advance|Declare|Start/.test(t))

  it("advances to the phase after the declared one", () => {
    mount({
      declared: true,
      currentPhase: phase("p1", "Hacking"),
      nextPhase: phase("p2", "Judging"),
    })

    expect(submitLabel()).toMatch(/Advance to Judging/)
  })

  it("declares the phase the dates say is running, rather than skipping it", () => {
    mount({
      declared: false,
      currentPhase: phase("p1", "Hacking"),
      nextPhase: phase("p2", "Judging"),
    })

    expect(submitLabel()).toMatch(/Declare Hacking current/)
  })

  it("starts the first phase still to come when nothing is running", () => {
    mount({
      declared: false,
      currentPhase: null,
      nextPhase: phase("p2", "Judging"),
    })

    expect(submitLabel()).toMatch(/Start Judging/)
  })

  it("offers nothing to advance to past the last phase", () => {
    mount({
      declared: true,
      currentPhase: phase("p1", "Wrap-up"),
      nextPhase: null,
    })

    expect(submitLabel()).toBeUndefined()
  })

  // With the marker unset, "Now" comes from the dates and clearing would post a
  // change that leaves the page looking exactly as it did.
  it("offers Clear the marker only against a declaration", () => {
    mount({ declared: true, currentPhase: phase("p1", "Hacking") })
    expect(
      screen.getByRole("button", { name: "Clear the marker" }),
    ).toBeInTheDocument()

    cleanup()
    mount({ declared: false, currentPhase: phase("p1", "Hacking") })
    expect(
      screen.queryByRole("button", { name: "Clear the marker" }),
    ).toBeNull()
  })

  // The one screen where the difference is actionable, so it is the one screen
  // that names it.
  it("says whether Now is declared or merely running by the calendar", () => {
    mount({ declared: true, currentPhase: phase("p1", "Hacking") })
    expect(screen.getByText("Declared")).toBeInTheDocument()

    cleanup()
    mount({ declared: false, currentPhase: phase("p1", "Hacking") })
    expect(screen.getByText("By dates")).toBeInTheDocument()
  })
})

describe("the hub for a participant", () => {
  // The route's own load answers 403 first; this is the component half of the
  // same rule, and it is what keeps the mock above honest — an empty manageNav
  // must stay empty.
  it("renders no tiles at all", () => {
    mount({ myMembership: { role: MEMBER, isWaiting: false } })

    expect(tileLabels()).toEqual([])
  })
})
