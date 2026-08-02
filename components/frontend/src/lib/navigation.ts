import type { ComponentType } from "svelte"
import { resolve } from "$app/paths"

import LayoutDashboard from "lucide-svelte/icons/layout-dashboard"
import Users from "lucide-svelte/icons/users"
import Lightbulb from "lucide-svelte/icons/lightbulb"
import UsersRound from "lucide-svelte/icons/users-round"
import Send from "lucide-svelte/icons/send"
import CalendarClock from "lucide-svelte/icons/calendar-clock"
import FileText from "lucide-svelte/icons/file-text"
import Route from "lucide-svelte/icons/route"
import CalendarDays from "lucide-svelte/icons/calendar-days"
import Plus from "lucide-svelte/icons/plus"

/**
 * A single sidebar entry.
 *
 * `id` is a stable key that never derives from user-supplied text. Page titles
 * are editable, so keying or active-matching on labels means two pages named
 * the same crash the sidebar with a duplicate key.
 */
export interface NavItem {
  id: string
  label: string
  icon: ComponentType
  /** Omit for a "not available yet" stub entry. */
  href?: string
}

/** Shallow page reference — deliberately not the generated `Page` type, since
 *  `$lib/server/**` must never be imported into a component. */
export interface HackathonPageRef {
  id: string
  title: string
}

/** Which of a hackathon's two sidebar modes is showing. */
export type NavMode = "view" | "manage"

/**
 * Derive the mode from the SvelteKit route id, never from the pathname: a
 * hackathon slug or a page titled "owner" must not flip the sidebar into
 * manage mode. The `(owner)` route group is the real boundary.
 */
export function navModeFromRouteId(routeId: string | null): NavMode {
  return routeId?.includes("/(owner)/") ? "manage" : "view"
}

/** Participant-facing nav for one hackathon, plus its visible content pages. */
export function memberNav(slug: string, pages: HackathonPageRef[]): NavItem[] {
  return [
    {
      id: "member:overview",
      label: "Overview",
      icon: LayoutDashboard,
      href: resolve(`/hackathon/${slug}/overview`),
    },
    {
      id: "member:timeline",
      label: "Timeline",
      icon: CalendarClock,
      href: resolve(`/hackathon/${slug}/timeline`),
    },
    {
      id: "member:tracks",
      label: "Tracks",
      icon: Route,
      href: resolve(`/hackathon/${slug}/tracks`),
    },
    {
      id: "member:participants",
      label: "Participants",
      icon: Users,
      href: resolve(`/hackathon/${slug}/participants`),
    },
    {
      id: "member:proposals",
      label: "Projects",
      icon: Lightbulb,
      href: resolve(`/hackathon/${slug}/proposals`),
    },
    {
      id: "member:teams",
      label: "Teams",
      icon: UsersRound,
      href: resolve(`/hackathon/${slug}/teams`),
    },
    {
      id: "member:submissions",
      label: "Submissions",
      icon: Send,
      href: resolve(`/hackathon/${slug}/submissions`),
    },
    ...pages.map((p) => ({
      id: `member:page:${p.id}`,
      label: p.title,
      icon: FileText,
      href: resolve(`/hackathon/${slug}/pages/${p.id}`),
    })),
  ]
}

/** Organizer tools for one hackathon. */
export function manageNav(slug: string): NavItem[] {
  return [
    {
      id: "manage:overview",
      label: "Overview",
      icon: LayoutDashboard,
      href: resolve(`/owner/hackathon/${slug}`),
    },
    {
      id: "manage:timeline",
      label: "Timeline",
      icon: CalendarClock,
      href: resolve(`/owner/hackathon/${slug}/timeline`),
    },
    {
      id: "manage:tracks",
      label: "Tracks",
      icon: Route,
      href: resolve(`/owner/hackathon/${slug}/tracks`),
    },
    {
      id: "manage:participants",
      label: "Participants",
      icon: Users,
      href: resolve(`/owner/hackathon/${slug}/participants`),
    },
    {
      id: "manage:proposals",
      label: "Projects",
      icon: Lightbulb,
      href: resolve(`/owner/hackathon/${slug}/projects`),
    },
    {
      id: "manage:teams",
      label: "Teams",
      icon: UsersRound,
      href: resolve(`/owner/hackathon/${slug}/teams`),
    },
    {
      id: "manage:pages",
      label: "Pages",
      icon: FileText,
      href: resolve(`/owner/hackathon/${slug}/pages`),
    },
  ]
}

/**
 * Platform-wide administration — not scoped to any hackathon.
 *
 * Entries follow what the backend grants each global role, so the section never
 * offers a link that lands on a 403. A hackathon organizer holds exactly one
 * permission — `hackathon:create` — so they get the create entry only; Users and
 * All Hackathons stay admin-only (`UserService.List` denies anyone but admin).
 */
export function platformNav(roles: {
  isGlobalAdmin: boolean
  isHackathonOrganizer: boolean
}): NavItem[] {
  const items: NavItem[] = []

  if (roles.isGlobalAdmin) {
    items.push(
      {
        id: "platform:users",
        label: "Users",
        icon: Users,
        href: resolve("/(app)/(admin)/users"),
      },
      {
        id: "platform:hackathons",
        label: "All Hackathons",
        icon: CalendarDays,
        href: resolve("/(app)/(admin)/hackathons"),
      },
    )
  }

  if (roles.isGlobalAdmin || roles.isHackathonOrganizer) {
    items.push({
      id: "platform:hackathon-new",
      label: "Create Hackathon",
      icon: Plus,
      href: resolve("/(app)/(admin)/hackathons/new"),
    })
  }

  return items
}

/**
 * Href of the equivalent entry in `targetMode`'s nav, so switching modes keeps
 * the user on "the same" item (e.g. member Teams -> manage Teams) instead of
 * always dropping them back to that mode's overview.
 *
 * Falls back to the target mode's overview when `activeId` has no counterpart
 * there — e.g. member-only pages (Submissions, a content page) or owner-only
 * pages (Pages) don't exist in the other mode. Matching is by the id suffix, so
 * a pair need not sit at the same position in both navs.
 */
export function counterpartHref(
  activeId: string | undefined,
  targetMode: NavMode,
  slug: string,
  pages: HackathonPageRef[],
): string {
  const targetItems =
    targetMode === "manage" ? manageNav(slug) : memberNav(slug, pages)
  const fallback = targetItems[0]!.href!

  if (!activeId) return fallback

  const key = activeId.slice(activeId.indexOf(":") + 1)
  const targetId = `${targetMode === "manage" ? "manage" : "member"}:${key}`

  return targetItems.find((i) => i.id === targetId)?.href ?? fallback
}

/**
 * Id of the entry matching `pathname`, longest match winning so that
 * `/hackathons/new` beats `/hackathons`.
 *
 * Pass every section's items in one call: computing this per-section let two
 * sections highlight simultaneously, since each only saw its own hrefs.
 */
export function activeNavId(
  pathname: string,
  items: NavItem[],
): string | undefined {
  let bestId: string | undefined
  let bestLength = -1

  for (const item of items) {
    if (!item.href) continue
    if (pathname !== item.href && !pathname.startsWith(item.href + "/"))
      continue
    if (item.href.length > bestLength) {
      bestLength = item.href.length
      bestId = item.id
    }
  }

  return bestId
}
