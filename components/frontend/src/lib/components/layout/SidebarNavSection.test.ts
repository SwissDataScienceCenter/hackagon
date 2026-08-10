import { describe, it, expect } from "vitest"
import { fireEvent, render, screen } from "@testing-library/svelte"
import Users from "lucide-svelte/icons/users"
import SidebarNavSection from "./SidebarNavSection.svelte"
import type { NavItem } from "$lib/navigation/items"

// A real icon rather than a stub: the component renders it as `<Icon />`, and
// the ComponentType/Component mismatch this codebase works around
// (see the note at the top of $lib/navigation/items) is exactly the kind of
// thing a stub would paper over.
const item = (id: string, extra: Partial<NavItem> = {}): NavItem => ({
  id,
  label: id,
  icon: Users,
  href: `/${id}`,
  ...extra,
})

/** The folded rows' wrapper — the chevron carries an `aria-hidden` of its own. */
const hiddenWrapper = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('div[aria-hidden="true"]')

/** jsdom does not implement `inert`, so Svelte leaves it as a property there. */
const inert = (el: HTMLElement | null) =>
  el?.hasAttribute("inert") === true ||
  (el as (HTMLElement & { inert?: boolean }) | null)?.inert === true

describe("SidebarNavSection", () => {
  it("renders one link per item, labelled and linked", () => {
    render(SidebarNavSection, {
      items: [item("teams"), item("timeline")],
      collapsed: false,
    })

    expect(screen.getByRole("link", { name: "teams" })).toHaveAttribute(
      "href",
      "/teams",
    )
    expect(screen.getAllByRole("link")).toHaveLength(2)
  })

  // The caller computes activeId once across every section precisely so two
  // sections cannot both light up; within a section it must mark exactly one.
  it("marks only the active item as the current page", () => {
    render(SidebarNavSection, {
      items: [item("teams"), item("timeline")],
      collapsed: false,
      activeId: "timeline",
    })

    expect(screen.getByRole("link", { name: "timeline" })).toHaveAttribute(
      "aria-current",
      "page",
    )
    expect(screen.getByRole("link", { name: "teams" })).not.toHaveAttribute(
      "aria-current",
    )
  })

  it("renders an item with no href as something that is plainly not a link", () => {
    render(SidebarNavSection, {
      items: [item("someday", { href: undefined })],
      collapsed: false,
    })

    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.getByTitle("Not available yet")).toBeInTheDocument()
  })

  describe("when collapsed to the icon rail", () => {
    // There is no room for text, so the label has to survive as the accessible
    // name some other way — otherwise the rail is a column of unlabelled icons.
    it("drops the label text but keeps it as the link's title", () => {
      render(SidebarNavSection, {
        items: [item("teams")],
        collapsed: true,
      })

      expect(screen.queryByText("teams")).toBeNull()
      expect(screen.getByRole("link")).toHaveAttribute("title", "teams")
    })

    // The badge is dropped here, which is why memberNav also gives a hidden page
    // a different icon — on this rail the icon is the only thing left to carry
    // the distinction.
    it("drops the per-item state badge", () => {
      render(SidebarNavSection, {
        items: [item("notes", { badge: "Hidden" })],
        collapsed: true,
      })

      expect(screen.queryByText("Hidden")).toBeNull()
    })

    it("drops the section heading and its role chip", () => {
      render(SidebarNavSection, {
        label: "Manage",
        badge: "Owner",
        items: [item("teams")],
        collapsed: true,
      })

      expect(screen.queryByText("Manage")).toBeNull()
      expect(screen.queryByText("Owner")).toBeNull()
    })
  })

  describe("badges", () => {
    it("shows a per-item state badge with the variant the item asked for", () => {
      render(SidebarNavSection, {
        items: [
          item("notes", { badge: "Hidden", badgeVariant: "badge-warning" }),
        ],
        collapsed: false,
      })

      expect(screen.getByText("Hidden")).toHaveClass("badge", "badge-warning")
    })

    // A state chip keeps its own variant rather than the section's accent, so an
    // item that names no variant must still land on a neutral one rather than
    // inheriting a hue that means something else.
    it("falls back to neutral for an item badge with no variant", () => {
      render(SidebarNavSection, {
        items: [item("notes", { badge: "Hidden" })],
        collapsed: false,
      })

      expect(screen.getByText("Hidden")).toHaveClass("badge", "badge-neutral")
    })

    it("takes the section's accent for the heading chip", () => {
      render(SidebarNavSection, {
        label: "Platform",
        badge: "Admin",
        items: [item("users")],
        collapsed: false,
        accent: "tertiary",
      })

      expect(screen.getByText("Admin")).toHaveClass("badge", "badge-info")
    })
  })

  // A section can be heading-only — an organiser has a role worth naming before
  // they have anything to link to — but only where the heading actually renders.
  //
  // "Renders nothing" is asserted as "no section wrapper and no text" rather
  // than an empty container: Svelte 5 leaves an `<!---->` anchor comment behind
  // for the {#if}, so the container is never literally empty. The wrapper div is
  // the bordered strip these cases exist to keep off the rail.
  describe("when it has no items", () => {
    const rendersNothing = (container: HTMLElement) => {
      expect(container.querySelector("div")).toBeNull()
      expect(container.textContent).toBe("")
    }

    it("still renders a labelled section, so the role chip has somewhere to sit", () => {
      render(SidebarNavSection, {
        label: "Manage",
        items: [],
        collapsed: false,
      })

      expect(screen.getByText("Manage")).toBeInTheDocument()
    })

    it("renders nothing when collapsed, rather than an empty bordered strip", () => {
      const { container } = render(SidebarNavSection, {
        label: "Manage",
        items: [],
        collapsed: true,
      })

      rendersNothing(container)
    })

    it("renders nothing when it has no heading either", () => {
      const { container } = render(SidebarNavSection, {
        items: [],
        collapsed: false,
      })

      rendersNothing(container)
    })
  })

  // Folding narrows the section rather than removing it: hiding every row leaves
  // a heading nobody who did not already know about it would open.
  describe("with a parent item", () => {
    const parented = (extra: Record<string, unknown> = {}) => ({
      label: "Manage",
      parentItem: item("hackathon"),
      items: [item("teams"), item("timeline")],
      collapsed: false,
      ...extra,
    })

    // Queried by role, so this is the accessibility tree and not the markup: the
    // folded rows are still in the DOM to give the height something to animate
    // from, and it is `inert` plus `aria-hidden` that puts them out of reach.
    it("keeps the parent on the rail while its items are folded away", () => {
      render(SidebarNavSection, parented({ open: false }))

      expect(
        screen.getByRole("link", { name: "hackathon" }),
      ).toBeInTheDocument()
      expect(screen.queryByRole("link", { name: "teams" })).toBeNull()
    })

    it("shows the items when unfolded", () => {
      const { container } = render(SidebarNavSection, parented({ open: true }))

      expect(screen.getByRole("link", { name: "teams" })).toBeInTheDocument()
      expect(hiddenWrapper(container)).toBeNull()
    })

    // Rendered but unreachable, which only holds while both guards are on the
    // wrapper: `aria-hidden` alone would leave the links in the tab order.
    it("puts the folded rows out of reach rather than out of the document", () => {
      const { container } = render(SidebarNavSection, parented({ open: false }))

      const wrapper = hiddenWrapper(container)
      expect(wrapper).toContainElement(screen.getByText("teams"))
      expect(inert(wrapper)).toBe(true)
    })

    // A sibling of the link rather than part of it: the parent row is a page of
    // its own and stays reachable while the items under it are folded.
    it("discloses the items from a control beside the parent link", async () => {
      let toggled = 0
      render(
        SidebarNavSection,
        parented({ open: false, onToggle: () => (toggled += 1) }),
      )

      const chevron = screen.getByRole("button", { name: /Show hackathon/ })
      expect(chevron).toHaveAttribute("aria-expanded", "false")

      await fireEvent.click(chevron)
      expect(toggled).toBe(1)
    })

    it("renders a parent-only section that has no items of its own", () => {
      render(SidebarNavSection, {
        label: "Manage",
        parentItem: item("hackathon"),
        items: [],
        collapsed: false,
      })

      expect(
        screen.getByRole("link", { name: "hackathon" }),
      ).toBeInTheDocument()
      expect(screen.queryByRole("button")).toBeNull()
    })

    // No chevron is drawn there, so a stored "closed" would blank the icons with
    // no control left to bring them back.
    it("ignores the fold state on the icon rail", () => {
      render(SidebarNavSection, parented({ collapsed: true, open: false }))

      expect(screen.getByRole("link", { name: "teams" })).toBeInTheDocument()
      expect(screen.queryByRole("button")).toBeNull()
    })
  })
})
