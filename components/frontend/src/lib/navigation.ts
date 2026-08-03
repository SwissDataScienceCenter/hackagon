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
import House from "lucide-svelte/icons/house"

import type {
  Capabilities,
  Capability,
  CapabilityInfo,
  CapabilityState,
} from "$lib/utils/capabilities"

/**
 * The capability governing a nav item, resolved for right now.
 *
 * It annotates the entry; it never removes it — a member whose submissions have
 * closed still needs to reach the page to see what they submitted, and hiding
 * the entry reads as a broken app rather than a closed phase.
 *
 * A gate being present is a positive statement that the server has an opinion
 * about this entry. `ungoverned` is therefore excluded from `state` rather than
 * being a case renderers must remember to skip: the usual trap is writing
 * `state !== "open"` and locking every hackathon that predates a capability, and
 * a state that cannot occur cannot be got wrong.
 */
export interface NavGate extends CapabilityInfo {
  capability: Capability
  state: Exclude<CapabilityState, "ungoverned">
}

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
  /** Absent when the entry is ungated, when the server has no opinion about it,
   *  or when no capability data was passed. */
  gate?: NavGate
}

/** Shallow page reference — deliberately not the generated `Page` type, since
 *  `$lib/server/**` must never be imported into a component. */
export interface HackathonPageRef {
  id: string
  title: string
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
      href: resolve("/(app)/(member)/dashboard"),
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

/**
 * Which capability decides what a member can do on each page.
 *
 * Overview, Timeline and content pages are absent because they gate nothing —
 * they are readable in every phase.
 *
 * Participants is absent on purpose, though `register` governs it: a member
 * inside this shell has already joined, so "Registration opens Aug 22" on their
 * Participants tab is a fact about other people. That pairing earns its keep in
 * the manage nav, not here.
 */
const MEMBER_GATES: Readonly<Record<string, Capability>> = {
  "member:proposals": "submit_proposal",
  "member:teams": "set_team_preferences",
  "member:submissions": "submit_project",
}

/**
 * The same idea for organizers, and it includes the Participants/`register`
 * pairing the member nav leaves out: "registration closed" is exactly what an
 * organizer wants on that row.
 *
 * These describe the hackathon, not the viewer. `requireCapability` lets anyone
 * who can write the hackathon through the gate, so an organizer is never blocked
 * by one — see `gateStyle` on SidebarNavSection, which is what stops the sidebar
 * claiming otherwise.
 */
const MANAGE_GATES: Readonly<Record<string, Capability>> = {
  "manage:participants": "register",
  "manage:proposals": "submit_proposal",
  "manage:teams": "set_team_preferences",
}

/**
 * Attach the governing capability, resolved for now, to the entries that have
 * one.
 *
 * An `ungoverned` capability is dropped rather than passed through: a hackathon
 * predating it has to look exactly as it did before, and the surest way to
 * guarantee that is to hand the renderer nothing to misread.
 */
function withGates(
  items: NavItem[],
  gates: Readonly<Record<string, Capability>>,
  capabilities?: Capabilities,
): NavItem[] {
  if (!capabilities) return items

  return items.map((item) => {
    const capability = gates[item.id]
    if (!capability) return item

    const info = capabilities[capability]
    if (info.state === "ungoverned") return item

    return { ...item, gate: { capability, ...info, state: info.state } }
  })
}

/**
 * Participant-facing nav for one hackathon, plus its visible content pages.
 *
 * `capabilities` is optional so a caller with no data — or a backend that
 * predates them — yields today's plain nav rather than an all-locked one.
 */
export function memberNav(
  slug: string,
  pages: HackathonPageRef[],
  capabilities?: Capabilities,
): NavItem[] {
  const items: NavItem[] = [
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

  return withGates(items, MEMBER_GATES, capabilities)
}

/** Organizer tools for one hackathon. */
export function manageNav(
  slug: string,
  capabilities?: Capabilities,
): NavItem[] {
  const items: NavItem[] = [
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

  return withGates(items, MANAGE_GATES, capabilities)
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
