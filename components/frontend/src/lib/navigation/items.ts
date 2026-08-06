// What the sidebar's entries *are*, separate from how any surface draws them:
// the sidebar renders these as rows on a collapsible rail, the dashboard's
// Manage platform section renders the same entries as tiles with descriptions.
// A component could serve one of those; a list of plain data serves both.
//
// This module owns the icon imports, which is why `activeNavId` lives in
// ./active and the role rules in $lib/utils/hackathonRole — a server load that
// only needs a permission must not pull the lucide barrel in behind it.
//
// ComponentType, not Component: lucide-svelte 0.479 still ships its icons as
// legacy SvelteComponentTyped classes, which the Svelte 5 `Component` type
// rejects.
import type { ComponentType } from "svelte"
import { resolve } from "$app/paths"
import { OWNER, type ViewerMembership } from "$lib/utils/hackathonRole"

import LayoutDashboard from "lucide-svelte/icons/layout-dashboard"
import Users from "lucide-svelte/icons/users"
import Lightbulb from "lucide-svelte/icons/lightbulb"
import ClipboardCheck from "lucide-svelte/icons/clipboard-check"
import ClipboardList from "lucide-svelte/icons/clipboard-list"
import UsersRound from "lucide-svelte/icons/users-round"
import UserRoundCheck from "lucide-svelte/icons/user-round-check"
import UserRoundCog from "lucide-svelte/icons/user-round-cog"
import Send from "lucide-svelte/icons/send"
import CalendarClock from "lucide-svelte/icons/calendar-clock"
import CalendarCog from "lucide-svelte/icons/calendar-cog"
import FileText from "lucide-svelte/icons/file-text"
import EyeOff from "lucide-svelte/icons/eye-off"
import Pencil from "lucide-svelte/icons/pencil"
import Tag from "lucide-svelte/icons/tag"
import Vote from "lucide-svelte/icons/vote"
import Trophy from "lucide-svelte/icons/trophy"

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
  /**
   * State chip on the entry itself, e.g. "Hidden" on a page only its organisers
   * can see. Kept a plain string with a caller-supplied variant, so the nav
   * never grows a per-status vocabulary of its own.
   */
  badge?: string
  /** Badge class for `badge`. A lifecycle state, so never `badge-accent`. */
  badgeVariant?: string
  /**
   * One line on what the destination is for.
   *
   * Optional, and ignored by the sidebar — a 4rem-collapsible rail has no room
   * for it, and the label is enough when the entry sits under a heading that
   * already frames it. It exists for callers that render the same entries with
   * space to explain them, such as the dashboard's Manage platform tiles, so a
   * destination is described once here rather than restated per surface.
   */
  description?: string
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
  /**
   * Whether participants can see this page.
   *
   * Required rather than optional on purpose: `PageService.List` only filters
   * `visible: false` out for callers *without* `page:write`
   * (`page_service.go:31`), so an organiser's list mixes hidden pages in with
   * published ones. Defaulting a missing flag to "visible" would silently
   * restore exactly the ambiguity the badge exists to remove, so the compiler
   * makes every caller state it.
   */
  visible: boolean
}

/**
 * Participant-facing nav for one hackathon, followed by its content pages.
 *
 * Every entry is one a participant can use, so the list is identical whatever
 * the viewer's role — organiser-only destinations live in `manageNav`. Only
 * routes that exist are listed; there are no stub entries.
 *
 * `pages` come last because an organiser adds and removes them at will, and the
 * fixed entries above must not move when they do. The caller passes them already
 * filtered and ordered (`PageService.List` does both server-side), so this
 * function never decides what a member may see.
 *
 * `votingEnabled` and `resultsVisible` are the hackathon's `CAPABILITY_VOTE` and
 * `CAPABILITY_VIEW_RESULTS`, and gate the only two conditional entries. Each
 * capability is what grants the casbin row every read on its page depends on
 * (`vote_category:read`, `vote_result:read`), so without it the entry could only
 * lead to a 403. They gate independently because the backend keeps them
 * separate: an organiser closes voting, checks the tally, then publishes.
 */
export function memberNav(
  hackathonId: string,
  pages: HackathonPageRef[] = [],
  votingEnabled = false,
  resultsVisible = false,
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
    // Nested under `projects` in the URL, which is what keeps this entry lit
    // across its own sub-routes (propose, edit) rather than handing the
    // highlight to All Projects — `activeNavId` keeps the longest matching href.
    // Position in this list is presentation only.
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
    // Between Submissions and Timeline: the entries follow the hackathon's own
    // order of events. Organisers reach voting setup through `manageNav`
    // whatever this says, so hiding it blocks nobody from preparing categories.
    ...(votingEnabled
      ? [
          {
            id: "member:voting",
            label: "Voting",
            icon: Vote,
            href: resolve(`/my/hackathon/${hackathonId}/voting`),
          },
        ]
      : []),
    // After Voting, on its own capability rather than that one's.
    ...(resultsVisible
      ? [
          {
            id: "member:results",
            label: "Results",
            icon: Trophy,
            href: resolve(`/my/hackathon/${hackathonId}/results`),
          },
        ]
      : []),
    {
      id: "member:timeline",
      label: "Timeline",
      icon: CalendarClock,
      href: resolve(`/my/hackathon/${hackathonId}/timeline`),
    },
    // Keyed by page id, never by title: titles are editable and need not be
    // unique, and two pages named the same would collide on a title-derived key
    // and take the sidebar's {#each} down.
    //
    // A page participants cannot see is badged, not omitted — this list is the
    // only place an organiser sees their pages. `EyeOff` carries the same
    // distinction on the collapsed rail, where the badge is not rendered.
    // "Hidden" rather than "Draft": `visible` says who may see the page, not how
    // finished it is.
    ...pages.map((p) => ({
      id: `member:page:${p.id}`,
      label: p.title,
      icon: p.visible ? FileText : EyeOff,
      href: resolve(`/my/hackathon/${hackathonId}/pages/${p.id}`),
      ...(p.visible
        ? {}
        : { badge: "Hidden", badgeVariant: "badge-warning" as const }),
    })),
  ]
}

/**
 * Platform-wide administration — not scoped to any hackathon.
 *
 * Admin-only, and so is every entry: `UserService.List` denies anyone else. An
 * organizer's one permission, `hackathon:create`, is a hackathon action, so an
 * organizer sees no Platform section at all rather than an empty one.
 *
 * A list here rather than markup inlined in the dashboard, so an entry added
 * below reaches every surface that renders it and is described once. The
 * dashboard's tiles are what show `description`; the sidebar ignores it.
 */
export function platformNav(roles: { isGlobalAdmin: boolean }): NavItem[] {
  if (!roles.isGlobalAdmin) return []

  return [
    {
      id: "platform:users",
      label: "Users",
      icon: Users,
      href: resolve("/(app)/manage/users"),
      description:
        "Everyone registered on the platform. Grant or revoke the Admin and " +
        "Hackathon Organizer roles.",
    },
  ]
}

/**
 * Organiser-only destinations for one hackathon, rendered as its own section.
 *
 * Separate from `memberNav` so the participant spine is identical across roles:
 * an owner and a member looking at "Timeline" see the same entry in the same
 * place, and what an owner gains is additive.
 *
 * One gate covers every entry because the backend applies the same one to each:
 * `mayManageParticipants`, `mayManagePhases`, `mayManagePages` and
 * `mayManageTracks` (`$lib/server/hackathon/capabilities.ts`), and the team
 * management route's own load, all reduce to owner-or-admin — casbin grants
 * `hackathon:write` / `phase:write` / `page:write` / `track:write` to `Owner`
 * outright and to an admin through the global escape hatch, with no capability
 * gating any of them. So this never offers a link that then refuses. Add a
 * per-entry gate the day an entry needs a narrower one rather than widening this
 * one: `/edit` would be the first, since `canEditHackathon` also requires the
 * owner be confirmed, which is why it is reached from the dashboard and not
 * listed here. `isWaiting` is deliberately not consulted; nor does the backend.
 *
 * Entries follow the order of the participant entries they extend, and most are
 * nested under that entry's route (`/teams/manage` under `/teams`) so
 * `activeNavId`'s longest match lights the Manage entry while its page is open.
 * Two are not: Manage Tracks has no participant counterpart, and Manage Pages is
 * the *parent* of the individual `/pages/<id>` routes, so opening a page lights
 * that page rather than it.
 */
export function manageNav(
  hackathonId: string,
  membership: ViewerMembership | undefined,
  isGlobalAdmin: boolean,
): NavItem[] {
  if (!isGlobalAdmin && membership?.role !== OWNER) return []

  return [
    // The participant page lists the same people and offers nothing to act on;
    // Approve and Remove exist only here.
    {
      id: "manage:participants",
      label: "Manage Participants",
      icon: UserRoundCheck,
      href: resolve(`/my/hackathon/${hackathonId}/participants/manage`),
    },
    // The review queue — every status, with Approve and Revoke on the rows —
    // against All Projects' read-only list of the approved ones. Both link to a
    // detail route rendering the same `ProjectDetail`: read there, act here.
    {
      id: "manage:projects",
      label: "Manage Projects",
      icon: ClipboardCheck,
      href: resolve(`/my/hackathon/${hackathonId}/projects/manage`),
    },
    // Shown even when the hackathon has no tracks yet: that is how an owner gets
    // the first one. The participant surfaces (propose, project edit, overview)
    // hide themselves when there are none.
    {
      id: "manage:tracks",
      label: "Manage Tracks",
      icon: Tag,
      href: resolve(`/my/hackathon/${hackathonId}/tracks`),
    },
    {
      id: "manage:teams",
      label: "Manage Teams",
      icon: UserRoundCog,
      href: resolve(`/my/hackathon/${hackathonId}/teams/manage`),
    },
    // The whole timeline, not just phase creation: edit, delete, declare a phase
    // current, and set the hackathon's capabilities all live on this one page.
    {
      id: "manage:timeline",
      label: "Manage Timeline",
      icon: CalendarCog,
      href: resolve(`/my/hackathon/${hackathonId}/timeline/manage`),
    },
    // Shown whether or not voting is on, unlike the participant entry it nests
    // under: categories have to exist before voting opens, so gating the setup
    // screen on the capability would surface it only once it was too late.
    {
      id: "manage:voting",
      label: "Manage Voting",
      icon: Vote,
      href: resolve(`/my/hackathon/${hackathonId}/voting/manage`),
    },
    // Last, because the page list it acts on is last in `memberNav`.
    {
      id: "manage:pages",
      label: "Manage Pages",
      icon: Pencil,
      href: resolve(`/my/hackathon/${hackathonId}/pages`),
    },
  ]
}
