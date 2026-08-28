import { fireEvent, render, screen } from "@testing-library/svelte"
import { tick } from "svelte"
import { beforeEach, describe, expect, it, vi } from "vitest"

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

/*
 * The disclosure rule, as against how one section renders
 * (SidebarNavSection.test.ts). Both headings are always on the rail for an
 * owner; what is under either of them is not necessarily out. Manage Hackathon
 * starts open — Settings included, since it is one of the screens in the
 * section and not the way in — and Participant View starts folded, which is the
 * whole point of labelling it: an owner arriving gets their own section, not a
 * participant's. Arriving anywhere inside either section brings that one out, so
 * the lit row is never hidden, and the chevron works wherever you are — an
 * earlier version derived the state from the route and so dead-ended on every
 * Manage page.
 *
 * A participant has no Manage section, and so no heading and no chevron over
 * their entries either: for them this is one plain list, exactly as before.
 *
 * Manage Tracks is the one entry that is not always in the section: it turns up
 * with `trackCount`, because tracks are optional (see `manageNav`).
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

/** Each section's only permanent row: the heading, which is also the chevron. */
const heading = () =>
  screen.queryByRole("button", { name: /Manage Hackathon pages/ })
const memberHeading = () =>
  screen.queryByRole("button", { name: /Participant View pages/ })
const settings = () => screen.queryByRole("link", { name: "Settings" })
const subEntry = () => screen.queryByRole("link", { name: "Manage Teams" })
const tracksEntry = () => screen.queryByRole("link", { name: "Manage Tracks" })
/** Stands for the participant entries: `memberNav` always offers this one. */
const memberEntry = () => screen.queryByRole("link", { name: "Overview" })

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
  // The arrival case, and the reason the defaults are the way round they are: an
  // owner opening a hackathon lands on Settings, and what they get is their own
  // section already out.
  it("is open on arrival, with no preference saved", async () => {
    await renderAt("/my/hackathon/h1/manage")

    expect(heading()).toBeInTheDocument()
    expect(settings()).toBeInTheDocument()
    expect(subEntry()).toBeInTheDocument()
  })

  // The regression the three-valued read of localStorage exists to prevent: an
  // unset key is not a saved `false`, and comparing to 'true' would shut the
  // section for everyone who had never touched the chevron.
  it("stays open for a reader who saved it open", async () => {
    window.localStorage.setItem("sidebar-manage-open", "true")

    await renderAt("/my/hackathon/h1/overview")

    expect(subEntry()).toBeInTheDocument()
  })

  it("stays shut for a reader who saved it shut", async () => {
    window.localStorage.setItem("sidebar-manage-open", "false")

    await renderAt("/my/hackathon/h1/overview")

    expect(heading()).toBeInTheDocument()
    expect(subEntry()).toBeNull()
  })

  it("shows the rest on one of the screens under it", async () => {
    await renderAt("/my/hackathon/h1/teams/manage")

    expect(subEntry()).toBeInTheDocument()
  })

  it("opens again from the chevron after being shut", async () => {
    window.localStorage.setItem("sidebar-manage-open", "false")
    await renderAt("/my/hackathon/h1/overview")

    await fireEvent.click(
      screen.getByRole("button", { name: /Show Manage Hackathon/ }),
    )

    expect(subEntry()).toBeInTheDocument()
  })

  // The regression: pinned open inside Manage, this click did nothing at all.
  it("closes again from the chevron while inside the section", async () => {
    await renderAt("/my/hackathon/h1/manage")

    await fireEvent.click(
      screen.getByRole("button", { name: /Hide Manage Hackathon/ }),
    )

    expect(subEntry()).toBeNull()
    expect(heading()).toBeInTheDocument()
  })

  it("gives a plain member no Manage section at all", async () => {
    await renderAt("/my/hackathon/h1/overview", {
      membership: { role: 2, isWaiting: false },
    })

    expect(heading()).toBeNull()
    expect(subEntry()).toBeNull()
  })

  // The sidebar is the only caller that knows how many tracks there are, so it
  // is where the optional entry is proved. Opened on a Manage page so the rows
  // are out rather than folded away.
  describe("Manage Tracks", () => {
    it("is absent for a hackathon with no tracks", async () => {
      await renderAt("/my/hackathon/h1/manage")

      expect(subEntry()).toBeInTheDocument()
      expect(tracksEntry()).toBeNull()
    })

    it("appears once the hackathon has one", async () => {
      await renderAt("/my/hackathon/h1/manage", { trackCount: 1 })

      expect(tracksEntry()).toBeInTheDocument()
    })
  })
})

describe("HackathonSidebar's Participant View section", () => {
  // The change itself: an owner on Settings gets a heading naming the other side
  // of the hackathon, not ten participant rows above their own section.
  it("is folded behind a heading for an owner on a Manage page", async () => {
    await renderAt("/my/hackathon/h1/manage")

    expect(memberHeading()).toBeInTheDocument()
    expect(memberEntry()).toBeNull()
  })

  it("opens from the chevron", async () => {
    await renderAt("/my/hackathon/h1/manage")

    await fireEvent.click(
      screen.getByRole("button", { name: /Show Participant View/ }),
    )

    expect(memberEntry()).toBeInTheDocument()
  })

  // Never fold away the lit row: an owner who navigates to a participant page
  // finds the section around it already open, whatever it was before.
  it("opens itself when an owner is on a participant page", async () => {
    await renderAt("/my/hackathon/h1/overview")

    expect(memberEntry()).toBeInTheDocument()
  })

  it("closes again from the chevron while inside it", async () => {
    await renderAt("/my/hackathon/h1/overview")

    await fireEvent.click(
      screen.getByRole("button", { name: /Hide Participant View/ }),
    )

    expect(memberEntry()).toBeNull()
    expect(memberHeading()).toBeInTheDocument()
  })

  // A participant gains nothing and loses nothing: no heading to name a
  // distinction they cannot see, no chevron, and the entries simply out.
  it("is an unlabelled, unfoldable list for a plain member", async () => {
    await renderAt("/my/hackathon/h1/overview", {
      membership: { role: 2, isWaiting: false },
    })

    expect(memberHeading()).toBeNull()
    expect(memberEntry()).toBeInTheDocument()
  })
})
