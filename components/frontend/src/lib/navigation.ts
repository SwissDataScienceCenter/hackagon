// ComponentType, not Component: lucide-svelte 0.479 still ships its icons as
// legacy SvelteComponentTyped classes, which the Svelte 5 `Component` type
// rejects.
import type { ComponentType } from "svelte"
import { resolve } from "$app/paths"

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
 * Order matches the horizontal sub-nav this replaces, so the move to a sidebar
 * does not also reshuffle where people expect to find things. Only routes that
 * exist are listed — there are no stub entries for pages still to be built.
 *
 * `pages` are the hackathon's own content pages, which an organizer defines and
 * can rename or reorder at will. They come last because the list's length is
 * theirs to change, and the fixed entries above must not move when it does. The
 * caller passes them already filtered and ordered — `PageService.List` does both
 * server-side — so this function never decides what a member may see.
 *
 * Every entry here is one a participant can use, so this list is identical
 * whatever the viewer's role. Organiser-only destinations — including "Manage
 * Pages" and "Manage Tracks", which act on the lists above and below — live in
 * `manageNav` instead.
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
    // After Submissions, because that is what people vote on, and before
    // Timeline for the same reason Submissions sits there — the entries follow
    // the hackathon's own order of events.
    //
    // The one entry in this list gated on anything. `CAPABILITY_VOTE` is what
    // grants `member → vote_category:read`, and that row gates every read on the
    // voting path, so with voting off the page can only 403 a participant. An
    // entry that is dead more often than it is live is worse than one that
    // appears when judging opens — which is also the moment it becomes
    // meaningful. Organisers reach the setup screen through `manageNav`
    // regardless, so nobody is locked out of preparing categories in advance.
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
    // After Voting, and gated on its own capability rather than on that one.
    // `CAPABILITY_VIEW_RESULTS` is what grants `member → vote_result:read`, and
    // the backend keeps it separate from `CAPABILITY_VOTE` deliberately: an
    // organiser closes voting, checks the tally, then publishes. Folding the two
    // together here would either leak an empty page during voting or hide the
    // results after it.
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
    // Keyed by page id, never by title: two pages named the same would collide
    // on a title-derived key and take the sidebar down with them.
    //
    // A page participants cannot see is marked, not omitted: this list is the
    // only place an organiser sees their pages, so rendering one identically to a
    // published page leaves them no way to tell what is actually live. `EyeOff`
    // carries it on the icon rail, where the badge is not rendered.
    //
    // "Hidden" rather than "Draft": `visible` says who may see the page, not how
    // finished it is. A complete page can be deliberately withheld, and calling
    // that a draft would misdescribe it.
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
 * Admin-only, and therefore the whole section is: `UserService.List` denies
 * anyone but admin. An organizer's one permission, `hackathon:create`, is a
 * hackathon action, so an organizer sees no Platform section at all rather than
 * an empty one.
 *
 * The dashboard's Manage platform section is the only thing that renders this,
 * and the only way in: the header used to carry a Users link of its own,
 * hard-coded rather than read from here, and it is gone. Kept a list here rather
 * than inlined in that view so a settings page added below reaches any further
 * surface that asks for one, and is described once rather than per surface.
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

/** The viewer's relationship to one hackathon, as `HackathonMember` reports it. */
export interface ViewerMembership {
  /** HackathonRole: UNSPECIFIED=0, OWNER=1, MEMBER=2. */
  role: number
  isWaiting: boolean
}

const OWNER = 1
const MEMBER = 2

/**
 * Organiser-only destinations for one hackathon, rendered as its own section.
 *
 * Separate from `memberNav` rather than mixed into it so the participant spine
 * is byte-identical across roles: an owner and a member looking at "Timeline"
 * are looking at the same entry in the same position, and can say so to each
 * other. What an owner gains is additive and grouped under one heading that
 * explains why they can see it.
 *
 * One gate covers every entry because the backend applies the same one to each:
 * `mayManageParticipants`, `mayManagePhases`, `mayManagePages` and
 * `mayManageTracks` (`$lib/server/hackathon/capabilities.ts`) and the team
 * management route's own load all reduce to owner-or-admin, and casbin grants the
 * underlying `hackathon:write` / `phase:write` / `page:write` / `track:write` to
 * `Owner` outright and to an admin through the global escape hatch, with no
 * capability gating any of them.
 * So there is no state where this offers a link that then refuses. Add a
 * per-entry gate the day an entry needs a narrower one, rather than widening
 * this one. `isWaiting` is deliberately not consulted — the backend does not
 * consult it either, and an owner is not waitlisted in practice.
 *
 * Entries follow the order of the participant entries they extend, so the two
 * sections read down the page in the same sequence rather than as two unrelated
 * lists.
 *
 * Deliberately short, and deliberately not padded with stubs: `memberNav` lists
 * only routes that exist and this follows it.
 *
 * Editing the hackathon itself (`/my/hackathon/<id>/edit`) is the one existing
 * organiser route left out, and not by oversight: `canEditHackathon` also
 * requires the owner be confirmed, so it is the first entry that would need a
 * narrower gate than the section's. It reaches that route from the dashboard's
 * edit pencil today. Adding it here means adding that per-entry gate first.
 */
export function manageNav(
  hackathonId: string,
  membership: ViewerMembership | undefined,
  isGlobalAdmin: boolean,
): NavItem[] {
  if (!isGlobalAdmin && membership?.role !== OWNER) return []

  return [
    // First, because Participants is the first participant entry these extend.
    // Nested under it, so `activeNavId`'s longest match lights this entry and not
    // that one while the page is open — the same mechanism Manage Teams and
    // Manage Timeline rely on below.
    //
    // The participant page lists the same people and offers nothing to act on;
    // Approve and Remove exist only here.
    {
      id: "manage:participants",
      label: "Manage Participants",
      icon: UserRoundCheck,
      href: resolve(`/my/hackathon/${hackathonId}/participants/manage`),
    },
    // Then Projects, extending "All Projects" directly: that page lists the
    // approved ones and offers a preference, this one is the review queue —
    // every status, proposals first, with Approve and Revoke on the rows. Both
    // link to a detail route that renders the same `ProjectDetail`; deciding
    // happens on the list, so the pair is read-here, act-there.
    {
      id: "manage:projects",
      label: "Manage Projects",
      icon: ClipboardCheck,
      href: resolve(`/my/hackathon/${hackathonId}/projects/manage`),
    },
    // Then tracks, which categorise the projects above, so the control to define
    // them reads as acting on those two lists. Shown even when the hackathon has
    // no tracks yet: that is exactly how an owner gets the first one. The
    // participant-facing surfaces (propose, project edit, overview)
    // already hide themselves when there are none, so nothing further is
    // needed there.
    {
      id: "manage:tracks",
      label: "Manage Tracks",
      icon: Tag,
      href: resolve(`/my/hackathon/${hackathonId}/tracks`),
    },
    // Nested under the participant Teams route, so `activeNavId`'s longest match
    // lights this entry and not that one while the page is open — the same
    // mechanism Manage Timeline relies on below.
    //
    // Labelled for the page it opens rather than trimmed to "Teams": the
    // heading already says Manage, but an entry whose label repeats a
    // participant entry's verbatim is worse than one that repeats the heading,
    // and this way the label matches the `<h2>` it lands on.
    {
      id: "manage:teams",
      label: "Manage Teams",
      icon: UserRoundCog,
      href: resolve(`/my/hackathon/${hackathonId}/teams/manage`),
    },
    // Nested under the participant Timeline route, same as Manage Teams above.
    // This replaced a "New Phase" entry pointing straight at the create form:
    // creating a phase is one of several things an organiser does to the timeline
    // — edit, delete, declare a phase current, set the hackathon's capabilities —
    // and singling it out in the nav left the rest reachable only from a page that
    // no longer carries them. "Add phase" is a button on this page instead.
    {
      id: "manage:timeline",
      label: "Manage Timeline",
      icon: CalendarCog,
      href: resolve(`/my/hackathon/${hackathonId}/timeline/manage`),
    },
    // Nested under the participant Voting route, same as Manage Teams and
    // Manage Timeline above — and, unlike that entry, shown whether or not
    // voting is on. Categories have to exist before voting opens, so gating the
    // setup screen on the capability would mean it only appeared once it was
    // already too late to use.
    {
      id: "manage:voting",
      label: "Manage Voting",
      icon: Vote,
      href: resolve(`/my/hackathon/${hackathonId}/voting/manage`),
    },
    // Last, because the page list it acts on is last in `memberNav` for the same
    // reason: an organiser can add and remove pages at will, so anything below it
    // would move as they did.
    {
      id: "manage:pages",
      label: "Manage Pages",
      icon: Pencil,
      href: resolve(`/my/hackathon/${hackathonId}/pages`),
    },
  ]
}

/**
 * Role chip for the hackathon section heading.
 *
 * This is the only role signal a participant gets — `manageNav` gives an owner a
 * labelled section of their own, but everyone else has just this chip — and it
 * must not imply capabilities that are not there. `isWaiting` wins over `role`
 * because a waitlisted user is not yet a member in any useful sense. Global
 * admins can manage any hackathon without joining it, so they get a badge even
 * with no membership row.
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
 * Whether the viewer may edit a hackathon's own fields (name, description,
 * visibility, dates, logo) — the backend's `hackathon:write`, held by the
 * confirmed owner (a waitlisted owner does not count, same rule
 * `hackathonRoleBadge` applies) and, via the admin escape hatch, by a global
 * admin. Shared by the dashboard (to show the edit pencil) and the edit
 * route's own load (to guard it), so the two can never disagree about who is
 * let in.
 */
export function canEditHackathon(
  membership: ViewerMembership | undefined,
  isGlobalAdmin: boolean,
): boolean {
  if (isGlobalAdmin) return true

  return membership?.role === OWNER && !membership.isWaiting
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
