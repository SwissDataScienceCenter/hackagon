// ComponentType, not Component: lucide-svelte 0.479 still ships its icons as
// legacy SvelteComponentTyped classes, which the Svelte 5 `Component` type
// rejects.
import type { ComponentType } from "svelte"
import { resolve } from "$app/paths"

import LayoutDashboard from "lucide-svelte/icons/layout-dashboard"
import Users from "lucide-svelte/icons/users"
import Lightbulb from "lucide-svelte/icons/lightbulb"
import ClipboardList from "lucide-svelte/icons/clipboard-list"
import UsersRound from "lucide-svelte/icons/users-round"
import Send from "lucide-svelte/icons/send"
import CalendarClock from "lucide-svelte/icons/calendar-clock"
import FileText from "lucide-svelte/icons/file-text"
import Plus from "lucide-svelte/icons/plus"

/**
 * A single sidebar entry.
 *
 * `id` is a stable key that never derives from user-supplied text: hackathon and
 * page titles are editable, so keying or active-matching on labels means two
 * things named the same crash the sidebar with a duplicate key.
 */
export interface NavItem {
  id: string
  label: string
  icon: ComponentType
  /** Omit for a "not available yet" stub entry. */
  href?: string
}

/**
 * Shallow reference to one of a hackathon's content pages.
 *
 * Deliberately not the generated `Page` type: this module is imported by
 * components, and `$lib/server/**` is server-only. Two fields are all the nav
 * needs, so it takes two fields.
 */
export interface HackathonPageRef {
  id: string
  title: string
}

/**
 * Actions on the collection of hackathons rather than on any one of them.
 *
 * Not scoped to a hackathon, hence its own section rather than a `memberNav`
 * entry. There is deliberately no "My Hackathons" link here: the wordmark in
 * NavBar already goes to the dashboard from every page, and a second control to
 * the same place is one too many.
 *
 * Creating a hackathon lives here rather than under Platform: it acts on the
 * collection of hackathons this section is about, not on the platform's
 * accounts and settings. The entry follows the backend's own permission —
 * `hackathon:create`, held by organizers and, via the admin escape hatch, by
 * admins — so it never offers a link that lands on a 403. Everyone else gets an
 * empty list, so the caller must be prepared to render no section at all.
 */
export function homeNav(roles: {
  isGlobalAdmin: boolean
  isHackathonOrganizer: boolean
}): NavItem[] {
  const items: NavItem[] = []

  if (roles.isGlobalAdmin || roles.isHackathonOrganizer) {
    items.push({
      id: "home:hackathon-create",
      label: "Create Hackathon",
      icon: Plus,
      href: resolve("/(app)/hackathons/create"),
    })
  }

  return items
}

/**
 * Participant-facing nav for one hackathon, followed by its content pages.
 *
 * Order matches the horizontal sub-nav this replaces, so the move to a sidebar
 * does not also reshuffle where people expect to find things. Only routes that
 * exist are listed — there are no stub entries for pages still to be built.
 *
 * `pages` are the hackathon's own content pages, which an organizer defines and
 * can rename or reorder at will. They come last because the list's length is
 * theirs to change, and the fixed entries above must not move when it does. The
 * caller passes them already filtered and ordered — `PageService.List` does both
 * server-side — so this function never decides what a member may see.
 */
export function memberNav(
  hackathonId: string,
  pages: HackathonPageRef[] = [],
): NavItem[] {
  return [
    {
      id: "member:overview",
      label: "Overview",
      icon: LayoutDashboard,
      href: resolve(`/my/hackathon/${hackathonId}/overview`),
    },
    {
      id: "member:participants",
      label: "Participants",
      icon: Users,
      href: resolve(`/my/hackathon/${hackathonId}/participants`),
    },
    // Proposals before All Projects: proposing is what a member does first, and
    // the pair reads as a lifecycle — what you have put forward, then what the
    // hackathon has taken on.
    //
    // Order is presentation only. `activeNavId` scans every item and keeps the
    // longest matching href, so this entry stays lit across its own sub-routes
    // (propose, edit) wherever it sits in the list; what matters is that
    // `projects/proposals` is nested under `projects` in the URL, not that the two
    // are adjacent.
    {
      id: "member:my-projects",
      label: "Proposals",
      icon: ClipboardList,
      href: resolve(`/my/hackathon/${hackathonId}/projects/proposals`),
    },
    // What "all" covers depends on the viewer — every project for a reviewer,
    // the approved ones for everyone else.
    {
      id: "member:projects",
      label: "All Projects",
      icon: Lightbulb,
      href: resolve(`/my/hackathon/${hackathonId}/projects`),
    },
    {
      id: "member:teams",
      label: "Teams",
      icon: UsersRound,
      href: resolve(`/my/hackathon/${hackathonId}/teams`),
    },
    {
      id: "member:submissions",
      label: "Submissions",
      icon: Send,
      href: resolve(`/my/hackathon/${hackathonId}/submissions`),
    },
    {
      id: "member:timeline",
      label: "Timeline",
      icon: CalendarClock,
      href: resolve(`/my/hackathon/${hackathonId}/timeline`),
    },
    // Keyed by page id, never by title: two pages named the same would collide
    // on a title-derived key and take the sidebar down with them.
    ...pages.map((p) => ({
      id: `member:page:${p.id}`,
      label: p.title,
      icon: FileText,
      href: resolve(`/my/hackathon/${hackathonId}/pages/${p.id}`),
    })),
  ]
}

/**
 * Platform-wide administration — not scoped to any hackathon.
 *
 * Admin-only, and therefore the whole section is: `UserService.List` denies
 * anyone but admin. An organizer's one permission, `hackathon:create`, is a
 * hackathon action and sits in `homeNav` instead, so an organizer sees no
 * Platform section at all rather than an empty one.
 */
export function platformNav(roles: { isGlobalAdmin: boolean }): NavItem[] {
  if (!roles.isGlobalAdmin) return []

  return [
    {
      id: "platform:users",
      label: "Users",
      icon: Users,
      href: resolve("/(app)/manage/users"),
    },
  ]
}

/** Minimum a hackathon needs for `defaultHackathon` to rank it. */
export interface RankableHackathon {
  id: string
  /** HackathonStatus: PENDING=1, ACTIVE=2, FINISHED=3. */
  status: number
  startsAt?: Date
}

// Lower sorts first. Anything unrecognized, including UNSPECIFIED, goes last
// rather than being treated as one of the real states.
const STATUS_RANK: Partial<Record<number, number>> = { 2: 0, 1: 1, 3: 2 }
const FINISHED = 3

/**
 * Which hackathon to show in the nav when the URL names none.
 *
 * "The one you most likely want": happening now, else starting soonest, else
 * finished most recently. Undated hackathons sort last within their group, and
 * the id breaks ties so the sidebar cannot reorder itself between renders.
 *
 * Deliberately not "most recently visited" — that needs client storage and would
 * disagree between devices. This is derivable from data the sidebar already has.
 */
export function defaultHackathon<T extends RankableHackathon>(
  hackathons: T[],
): T | undefined {
  const byPreference = [...hackathons].sort((a, b) => {
    const rank = (h: T) => STATUS_RANK[h.status] ?? 3
    if (rank(a) !== rank(b)) return rank(a) - rank(b)

    // Undated last, whichever direction the group sorts in.
    if (!a.startsAt || !b.startsAt) {
      if (a.startsAt) return -1
      if (b.startsAt) return 1

      return a.id < b.id ? -1 : 1
    }

    const diff = a.startsAt.getTime() - b.startsAt.getTime()
    if (diff !== 0) {
      // Finished hackathons read newest-first; upcoming ones soonest-first.
      return a.status === FINISHED ? -diff : diff
    }

    return a.id < b.id ? -1 : 1
  })

  return byPreference[0]
}

/** The viewer's relationship to one hackathon, as `HackathonMember` reports it. */
export interface ViewerMembership {
  /** HackathonRole: UNSPECIFIED=0, OWNER=1, MEMBER=2. */
  role: number
  isWaiting: boolean
}

const OWNER = 1
const MEMBER = 2

/**
 * Role chip for the hackathon section heading.
 *
 * Owners get no extra nav entries — organizer controls live on the pages they
 * belong to, phases and capabilities on the timeline — so the badge is the only
 * thing in the sidebar distinguishing them, and it must not imply capabilities
 * that are not there. `isWaiting` wins over `role` because a waitlisted user is
 * not yet a member in any useful sense. Global admins can manage any hackathon
 * without joining it, so they get a badge even with no membership row.
 */
export function hackathonRoleBadge(
  membership: ViewerMembership | undefined,
  isGlobalAdmin: boolean,
): string | undefined {
  if (membership?.isWaiting) return "Waitlisted"
  if (membership?.role === OWNER) return "Owner"
  if (isGlobalAdmin) return "Admin"
  if (membership?.role === MEMBER) return "Member"

  return undefined
}

/**
 * Role chip for the Hackathons section heading.
 *
 * Names the global role that puts Create Hackathon there. An admin gets no chip
 * here — theirs is on the Platform section, and the two chips read as two roles
 * rather than one role stated twice.
 */
export function hackathonsRoleBadge(roles: {
  isHackathonOrganizer: boolean
}): string | undefined {
  return roles.isHackathonOrganizer ? "Organiser" : undefined
}

/**
 * Role chip for the Platform section heading.
 *
 * The section only renders for an admin — `platformNav` is empty for everyone
 * else — so this is the only role it can name.
 */
export function platformRoleBadge(roles: {
  isGlobalAdmin: boolean
}): string | undefined {
  return roles.isGlobalAdmin ? "Admin" : undefined
}

/**
 * Id of the entry matching `pathname`, longest match winning so that a nested
 * route beats its parent.
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
