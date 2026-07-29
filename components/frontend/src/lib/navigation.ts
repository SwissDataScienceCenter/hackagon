import type { ComponentType } from "svelte"
import { resolve } from "$app/paths"

import LayoutDashboard from "lucide-svelte/icons/layout-dashboard"
import Users from "lucide-svelte/icons/users"
import Lightbulb from "lucide-svelte/icons/lightbulb"
import UsersRound from "lucide-svelte/icons/users-round"
import Send from "lucide-svelte/icons/send"
import CalendarClock from "lucide-svelte/icons/calendar-clock"
import FileText from "lucide-svelte/icons/file-text"
import Milestone from "lucide-svelte/icons/milestone"
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
      id: "member:participants",
      label: "Participants",
      icon: Users,
      href: resolve(`/hackathon/${slug}/participants`),
    },
    {
      id: "member:proposals",
      label: "Proposals",
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
    {
      id: "member:timeline",
      label: "Timeline",
      icon: CalendarClock,
      href: resolve(`/hackathon/${slug}/timeline`),
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
      id: "manage:participants",
      label: "Participants",
      icon: Users,
      href: resolve(`/owner/hackathon/${slug}/participants`),
    },
    {
      id: "manage:pages",
      label: "Pages",
      icon: FileText,
      href: resolve(`/owner/hackathon/${slug}/pages`),
    },
    {
      id: "manage:phases",
      label: "Phases",
      icon: Milestone,
      href: resolve(`/owner/hackathon/${slug}/phases`),
    },
    {
      id: "manage:tracks",
      label: "Tracks",
      icon: Route,
      href: resolve(`/owner/hackathon/${slug}/tracks`),
    },
    {
      id: "manage:teams",
      label: "Teams",
      icon: UsersRound,
      href: resolve(`/owner/hackathon/${slug}/teams`),
    },
  ]
}

/** Platform-wide administration — not scoped to any hackathon. */
export function platformNav(): NavItem[] {
  return [
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
    {
      id: "platform:hackathon-new",
      label: "Create Hackathon",
      icon: Plus,
      href: resolve("/(app)/(admin)/hackathons/new"),
    },
  ]
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
