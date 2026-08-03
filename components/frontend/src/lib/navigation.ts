// ComponentType, not Component: lucide-svelte 0.479 still ships its icons as
// legacy SvelteComponentTyped classes, which the Svelte 5 `Component` type
// rejects.
import type { ComponentType } from "svelte"
import { resolve } from "$app/paths"

import LayoutDashboard from "lucide-svelte/icons/layout-dashboard"
import Users from "lucide-svelte/icons/users"
import Lightbulb from "lucide-svelte/icons/lightbulb"
import UsersRound from "lucide-svelte/icons/users-round"
import Send from "lucide-svelte/icons/send"
import CalendarClock from "lucide-svelte/icons/calendar-clock"
import Presentation from "lucide-svelte/icons/presentation"
import Image from "lucide-svelte/icons/image"
import House from "lucide-svelte/icons/house"

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
 * The participant's home — the hackathons they are in, and the ones they could
 * join.
 *
 * Always present, including inside a hackathon, so leaving one does not mean
 * hunting for the logo. Not scoped to a hackathon, hence its own section rather
 * than a `memberNav` entry.
 */
export function homeNav(): NavItem[] {
  return [
    {
      id: "home:dashboard",
      label: "My Hackathons",
      icon: House,
      href: resolve("/(app)/dashboard"),
    },
  ]
}

/**
 * Participant-facing nav for one hackathon.
 *
 * Order matches the horizontal sub-nav this replaces, so the move to a sidebar
 * does not also reshuffle where people expect to find things. Only routes that
 * exist are listed — there are no stub entries for pages still to be built.
 */
export function memberNav(hackathonId: string): NavItem[] {
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
    {
      id: "member:proposals",
      label: "Proposals",
      icon: Lightbulb,
      href: resolve(`/my/hackathon/${hackathonId}/proposals`),
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
    {
      id: "member:webinars",
      label: "Webinars",
      icon: Presentation,
      href: resolve(`/my/hackathon/${hackathonId}/webinars`),
    },
    {
      id: "member:photos",
      label: "Photos",
      icon: Image,
      href: resolve(`/my/hackathon/${hackathonId}/photos`),
    },
  ]
}

/**
 * Platform-wide administration — not scoped to any hackathon.
 *
 * Entries follow what the backend grants each global role, so the section never
 * offers a link that lands on a 403: `UserService.List` denies anyone but admin.
 * A hackathon organizer holds exactly one permission — `hackathon:create` —
 * which has no page on this branch yet, so they get the section heading and its
 * role badge but no entries. See `platformRoleBadge`.
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
 * Owners get no extra nav entries — the organizer pages do not exist yet — so
 * the badge is the only thing distinguishing them, and it must not imply
 * capabilities that are not there. `isWaiting` wins over `role` because a
 * waitlisted user is not yet a member in any useful sense. Global admins can
 * manage any hackathon without joining it, so they get a badge even with no
 * membership row.
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
 * Role chip for the Platform section heading.
 *
 * Admin outranks organizer: an admin holds every organizer permission, so
 * showing the lesser of the two roles would understate what they can do.
 */
export function platformRoleBadge(roles: {
  isGlobalAdmin: boolean
  isHackathonOrganizer: boolean
}): string | undefined {
  if (roles.isGlobalAdmin) return "Admin"
  if (roles.isHackathonOrganizer) return "Organiser"

  return undefined
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
