import { cleanup, render, screen } from "@testing-library/svelte"
import { tick } from "svelte"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// `page` supplies the one field this component reads from it, the pathname
// `activeNavId` matches on; `afterNavigate` only closes the mobile drawer.
vi.mock("$app/stores", async () => {
  const { writable } = await import("svelte/store")
  return { page: writable({ url: new URL("http://localhost/") }) }
})
vi.mock("$app/navigation", () => ({ afterNavigate: () => {} }))

import { page } from "$app/stores"
import HackathonSidebar from "./HackathonSidebar.svelte"

const OWNER = 1
const MEMBER = 2

/*
 * The Manage section is a flat, always-expanded list (see
 * SidebarNavSection.test.ts for how one section renders): every organiser
 * entry manageNav returns is drawn on every page, not disclosed behind a
 * fold. An earlier version folded the section under Manage Hackathon and
 * force-opened it on every /manage/* route, which made the sidebar taller
 * than its fixed, viewport-relative height and forced it to scroll — flat
 * avoids that, since the rendered height no longer depends on which page
 * you're on.
 */

const setPath = (pathname: string) =>
  (page as unknown as { set: (v: { url: URL }) => void }).set({
    url: new URL(`http://localhost${pathname}`),
  })

/** Renders as an owner at `pathname`, with the mount effects already flushed. */
async function renderAt(pathname: string, overrides = {}) {
  setPath(pathname)

  const result = render(HackathonSidebar, {
    hackathonId: "h1",
    hackathonName: "ORD Hackathon",
    pages: [],
    membership: { role: OWNER, isWaiting: false },
    isGlobalAdmin: false,
    ...overrides,
  })
  await tick()

  return result
}

const hub = () => screen.queryByRole("link", { name: "Manage Hackathon" })
const subEntry = () => screen.queryByRole("link", { name: "Manage Teams" })

// Every entry this branch has that main does not — named individually so a
// future refactor that drops one turns red rather than merely shrinking a
// count nobody reads back. "New Phase" is deliberately not here: it's a tile
// on the manage hub page, not one of manageNav's sidebar entries.
const OURS_ONLY = [
  "Prizes",
  "Deadlines",
  "Manage Forms",
  "Notifications",
  "Invitation Links",
]

afterEach(cleanup)

beforeEach(() => {
  // A fresh store per test, so a preference one saves cannot decide what the next
  // renders. Defined rather than cleared: jsdom's localStorage has no `clear`.
  const saved = new Map<string, string>()
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => void saved.set(k, v),
      removeItem: (k: string) => void saved.delete(k),
    },
  })

  // jsdom ships no matchMedia, and the component asks for one on mount to tell a
  // desktop rail from the mobile drawer.
  window.matchMedia = (query: string) =>
    ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
})

describe("HackathonSidebar's Manage section", () => {
  it("shows every Manage entry on a participant page, not just the hub", async () => {
    await renderAt("/my/hackathon/h1/overview")

    expect(hub()).toBeInTheDocument()
    expect(subEntry()).toBeInTheDocument()
  })

  it("shows every Manage entry on one of the screens under it too", async () => {
    await renderAt("/my/hackathon/h1/teams/manage")

    expect(hub()).toBeInTheDocument()
    expect(subEntry()).toBeInTheDocument()
  })

  // Nested under /manage, so `activeNavId`'s longest-prefix match keeps the hub
  // lit as the current page even though the list beneath it is flat.
  it("counts the edit form nested under it as the hub's own active page", async () => {
    await renderAt("/my/hackathon/h1/manage/edit")

    expect(subEntry()).toBeInTheDocument()
    expect(hub()).toHaveAttribute("aria-current", "page")
  })

  // The regression this reverts: a fold control that force-opened on every
  // Manage page anyway, so it existed only to make the section taller than
  // the sidebar's fixed height on the pages it mattered on.
  it("draws no fold control at all", async () => {
    await renderAt("/my/hackathon/h1/overview")

    expect(
      screen.queryByRole("button", { name: /Manage Hackathon/ }),
    ).toBeNull()
  })

  it("gives a plain member no Manage section at all", async () => {
    await renderAt("/my/hackathon/h1/overview", {
      membership: { role: MEMBER, isWaiting: false },
    })

    expect(hub()).toBeNull()
    expect(subEntry()).toBeNull()
  })

  // The port's own failure mode, asserted by name rather than by count: main's
  // Manage section has none of these, and a future refactor of this list is
  // exactly the kind of change that could drop one without anything turning red.
  it("keeps every entry this branch has that main does not", async () => {
    await renderAt("/my/hackathon/h1/manage")

    for (const label of OURS_ONLY) {
      expect(
        screen.queryByRole("link", { name: label }),
        `"${label}" is one of the organiser entries main's Manage panel does ` +
          `not have — it must not be lost`,
      ).toBeInTheDocument()
    }
  })
})
