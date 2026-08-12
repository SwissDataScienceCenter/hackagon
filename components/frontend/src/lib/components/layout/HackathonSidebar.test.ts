import { cleanup, fireEvent, render, screen } from "@testing-library/svelte"
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
 * The disclosure rule, as against how one section renders
 * (SidebarNavSection.test.ts): Manage Hackathon is always on the rail, the ten
 * screens under it are not, arriving anywhere in the section brings them out,
 * and the chevron works wherever you are — main's earlier version derived the
 * state from the route and so dead-ended on every Manage page.
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

// Every entry this branch has that main does not. They are the reason the fold
// exists here at all — ten organiser rows under a five-row participant spine —
// and the reason to name them one by one is that losing any of them to the port
// is the failure this whole change had to avoid.
const OURS_ONLY = [
  "Prizes",
  "Deadlines",
  "Manage Forms",
  "Notifications",
  "Invitation Links",
  "New Phase",
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
  // desktop rail from the mobile drawer. Desktop is where the disclosure lives.
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
  it("shows only Manage Hackathon on a participant page", async () => {
    await renderAt("/my/hackathon/h1/overview")

    expect(hub()).toBeInTheDocument()
    expect(subEntry()).toBeNull()
  })

  // The hub counts as entering the section: whoever opens it is looking for what
  // it leads to.
  it("shows the rest once Manage Hackathon itself is open", async () => {
    await renderAt("/my/hackathon/h1/manage")

    expect(subEntry()).toBeInTheDocument()
  })

  it("shows the rest on one of the screens under it", async () => {
    await renderAt("/my/hackathon/h1/teams/manage")

    expect(subEntry()).toBeInTheDocument()
  })

  // Nested under /manage, so `activeNavId`'s longest-prefix match keeps the hub
  // lit — which is also what counts as "inside" and brings the section out.
  it("counts the edit form nested under it as inside the section", async () => {
    await renderAt("/my/hackathon/h1/manage/edit")

    expect(subEntry()).toBeInTheDocument()
    expect(hub()).toHaveAttribute("aria-current", "page")
  })

  it("opens from the chevron on a participant page", async () => {
    await renderAt("/my/hackathon/h1/overview")

    await fireEvent.click(
      screen.getByRole("button", { name: /Show Manage Hackathon/ }),
    )

    expect(subEntry()).toBeInTheDocument()
  })

  // The regression main hit: pinned open inside Manage, this click did nothing.
  it("closes again from the chevron while inside the section", async () => {
    await renderAt("/my/hackathon/h1/manage")

    await fireEvent.click(
      screen.getByRole("button", { name: /Hide Manage Hackathon/ }),
    )

    expect(subEntry()).toBeNull()
    expect(hub()).toBeInTheDocument()
  })

  it("gives a plain member no Manage section at all", async () => {
    await renderAt("/my/hackathon/h1/overview", {
      membership: { role: MEMBER, isWaiting: false },
    })

    expect(hub()).toBeNull()
    expect(subEntry()).toBeNull()
  })

  // The port's own failure mode, asserted by name rather than by count: main's
  // Manage section has none of these, and folding the section is exactly the
  // kind of change that could drop one without anything turning red.
  it("keeps every entry this branch has that main does not", async () => {
    await renderAt("/my/hackathon/h1/manage")

    for (const label of OURS_ONLY) {
      expect(
        screen.queryByRole("link", { name: label }),
        `"${label}" is one of the organiser entries main's Manage panel does ` +
          `not have — the port must not lose it`,
      ).toBeInTheDocument()
    }
  })
})
