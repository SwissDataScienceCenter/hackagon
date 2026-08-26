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
import UsersRound from "lucide-svelte/icons/users-round"
import Lightbulb from "lucide-svelte/icons/lightbulb"
import ClipboardCheck from "lucide-svelte/icons/clipboard-check"
import ClipboardList from "lucide-svelte/icons/clipboard-list"
import UserRoundCheck from "lucide-svelte/icons/user-round-check"
import UserRoundCog from "lucide-svelte/icons/user-round-cog"
import Send from "lucide-svelte/icons/send"
import Ticket from "lucide-svelte/icons/ticket"
import CalendarClock from "lucide-svelte/icons/calendar-clock"
import CalendarCog from "lucide-svelte/icons/calendar-cog"
import FileText from "lucide-svelte/icons/file-text"
import Hourglass from "lucide-svelte/icons/hourglass"
import Info from "lucide-svelte/icons/info"
import EyeOff from "lucide-svelte/icons/eye-off"
import Pencil from "lucide-svelte/icons/pencil"
import SlidersHorizontal from "lucide-svelte/icons/sliders-horizontal"
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
 * `CAPABILITY_VIEW_RESULTS`, and gate two of the three conditional entries. Each
 * capability is what grants the casbin row every read on its page depends on
 * (`vote_category:read`, `vote_result:read`), so without it the entry could only
 * lead to a 403. They gate independently because the backend keeps them
 * separate: an organiser closes voting, checks the tally, then publishes.
 *
 * `teamCount` gates the third. Unlike the other two it is not a permission —
 * `TeamService.List` asks only for `hackathon:read`, which every confirmed
 * member has — it is whether the page has anything on it yet. Zero is the honest
 * default, the same way `manageNav` treats `trackCount`.
 *
 * `hasDescription` gates About on the same principle: the hackathon's
 * description is optional, and with none written the entry leads to a blank
 * page. False by default, so a caller that has not looked cannot claim there is
 * one.
 */
export function memberNav(
  hackathonId: string,
  pages: HackathonPageRef[] = [],
  votingEnabled = false,
  resultsVisible = false,
  teamCount = 0,
  hasDescription = false,
): NavItem[] {
  return [
    {
      id: "member:overview",
      label: "Overview",
      icon: LayoutDashboard,
      href: resolve(`/my/hackathon/${hackathonId}/overview`),
    },
    // Second, straight after Overview: it is what the hackathon *is*, so it is
    // what a first visit wants and what every later visit skips. It used to be
    // a clamped subtitle in the overview's hero, which rendered the organiser's
    // markdown as literal `##` and `-` characters and had room for two lines of
    // it. A destination of its own is what markdown needs.
    ...(hasDescription
      ? [
          {
            id: "member:about",
            label: "About",
            icon: Info,
            href: resolve(`/my/hackathon/${hackathonId}/about`),
          },
        ]
      : []),
    {
      id: "member:participants",
      label: "Participants",
      icon: Users,
      href: resolve(`/my/hackathon/${hackathonId}/participants`),
    },
    // One entry for every project surface a participant has. There is no
    // Proposals entry beside it: proposing is a phase of a project's life rather
    // than a place, so the projects page carries the proposals a viewer is
    // waiting on and the CTA that adds one, and this stays lit across
    // `projects/propose` and `projects/<id>/edit` on its own.
    {
      id: "member:projects",
      label: "Projects",
      icon: Lightbulb,
      href: resolve(`/my/hackathon/${hackathonId}/projects`),
    },
    // Between Projects and Submissions, following the hackathon's own order of
    // events: projects are approved, teams form on them, teams submit.
    //
    // This entry existed, was removed in favour of reaching a team from the
    // ballot, and is back — because the ballot only ever lists the teams a voter
    // may vote *on*, and only while voting is open, so there was no way to see
    // who is on which team. The list is the browse surface; the ballot is still
    // the only place a vote is cast.
    //
    // Only once teams exist. Teams form partway through a hackathon, and before
    // they do this leads to a page with nothing on it that a participant can do
    // nothing about — the same reason `manageNav` waits for a track. The count
    // comes from a `TeamService.List` in the hackathon layout, because
    // `Hackathon.Get` carries neither teams nor a count of them; see
    // `TODO(backend: hackathon-team-count)` there.
    //
    // `UsersRound` rather than `Users`: Participants above already holds that
    // one, and on the collapsed rail the icon is the whole entry.
    ...(teamCount > 0
      ? [
          {
            id: "member:teams",
            label: "Teams",
            icon: UsersRound,
            href: resolve(`/my/hackathon/${hackathonId}/teams`),
          },
        ]
      : []),
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
 * owner be confirmed — which is why it is offered on the Settings page itself,
 * behind that check of its own, rather than listed here. It nests under
 * `/manage` like every other single-record form, so Settings stays lit while it
 * is open. `isWaiting` is deliberately not consulted; nor does the backend.
 *
 * Entries follow the order of the participant entries they extend, and most are
 * nested under that entry's route (`/teams/manage` under `/teams`) so
 * `activeNavId`'s longest match lights the Manage entry while its page is open.
 * Three are not: Settings is the organiser's counterpart to Overview rather than
 * a child of it, Manage Tracks has no participant counterpart, and Manage Pages
 * is the *parent* of the individual `/pages/<id>` routes, so opening a page
 * lights that page rather than it.
 *
 * Waitlist has no participant counterpart either, and nests one level deeper
 * still: under Manage Participants, the entry it was split out of. The longest
 * match is what keeps that entry from swallowing it.
 *
 * `trackCount` decides whether Manage Tracks is offered at all: tracks are
 * optional, and a hackathon running without them should not carry a permanent
 * entry to a page listing nothing. Zero is the honest default — a caller that
 * does not know cannot claim there are any — and the way to the first track is
 * the Tracks card on Settings, which is always there.
 *
 * `needsAttention` badges Settings when the configuration is in a state
 * participants are blocked by — see `stateAlerts`. It marks that entry because
 * that is the page holding the switches that fix it. A bare "!" rather than a
 * count: the alerts are problems, the capabilities inside one are not, and a
 * number would silently mean whichever of the two the reader assumed. The banner
 * alongside it carries the detail.
 *
 * `isPrivate` decides whether Invitations is offered. Unlike `trackCount` this
 * is not "has it got any yet" but "can it ever want one": a public hackathon is
 * listed and joinable by anybody, so `Join` never looks at a token there
 * (`hackathon_service.go:511`) and a link minted for one grants nothing it did
 * not already have. The RPCs would succeed — `CreateInvite` never checks
 * visibility — which is exactly why the entry has to be gated here rather than
 * left for the backend to refuse. False by default, the same honest default the
 * counts use.
 */
export function manageNav(
  hackathonId: string,
  membership: ViewerMembership | undefined,
  isGlobalAdmin: boolean,
  needsAttention = false,
  trackCount = 0,
  isPrivate = false,
): NavItem[] {
  if (!isGlobalAdmin && membership?.role !== OWNER) return []

  return [
    // First, and the organiser's counterpart to the member Overview above: what
    // participants may do, which phase is current, and whether the hackathon has
    // tracks. Deliberately not nested under `/overview` — that page stays the
    // member's, and an organiser reading it sees what a participant sees.
    //
    // Named for what the page is rather than for the section it opens: the
    // heading above already reads "Manage Hackathon", and a row repeating it read
    // as the section's own row rather than as one of the pages in it.
    {
      id: "manage:settings",
      label: "Settings",
      icon: SlidersHorizontal,
      href: resolve(`/my/hackathon/${hackathonId}/manage`),
      description:
        "What participants can do right now, which phase the hackathon is " +
        "in, and its tracks.",
      ...(needsAttention
        ? { badge: "!", badgeVariant: "badge-warning" as const }
        : {}),
    },
    // The participant page lists the same people and offers nothing to act on;
    // Remove and the owner controls exist only here.
    {
      id: "manage:participants",
      label: "Manage Participants",
      icon: UserRoundCheck,
      href: resolve(`/my/hackathon/${hackathonId}/participants/manage`),
    },
    // The other half of that page, split off: people who have asked to join and
    // not been let in. Its own entry rather than a tab you have to know about,
    // because approving is the organiser action most easily forgotten — nothing
    // about a waiting applicant is visible from anywhere else, and Settings
    // badges this entry with the count.
    //
    // Always offered, unlike Manage Tracks: an empty waitlist is a fact worth
    // being able to check, where a hackathon with no tracks has decided not to
    // have any. Nested under the roster route, so `activeNavId`'s longest match
    // lights this entry here and Manage Participants on the tab beside it.
    {
      id: "manage:waitlist",
      label: "Waitlist",
      icon: Hourglass,
      href: resolve(
        `/my/hackathon/${hackathonId}/participants/manage/waitlist`,
      ),
    },
    // Only on a private hackathon, and immediately before the form, because the
    // two are the sign-up path in order: a link is how somebody arrives, the
    // form is what they are asked on the way, and the Waitlist above is where
    // they are let through. A public hackathon needs no link — it is listed, and
    // anybody can ask to join — so the entry would lead to a page whose every
    // link grants nothing.
    ...(isPrivate
      ? [
          {
            id: "manage:invites",
            label: "Invitations",
            icon: Ticket,
            href: resolve(`/my/hackathon/${hackathonId}/manage/invites`),
            description:
              "The links that let invited people see this event and ask to " +
              "join. Copy one into a mailing; revoke it if it spreads.",
          },
        ]
      : []),
    // Straight after Participants, because it is the other half of getting
    // people in: this decides what they are asked on the way, that page decides
    // who is let through. Always shown — a form with no questions is a legitimate
    // state, and this is the only way to add the first one.
    {
      id: "manage:forms",
      label: "Registration Form",
      icon: ClipboardList,
      href: resolve(`/my/hackathon/${hackathonId}/manage/forms`),
    },
    // The review queue — every status, with Approve and Revoke on the rows —
    // against the Projects page's read-only list of the approved ones. Both link
    // to a detail route rendering the same `ProjectDetail`: read there, act here.
    {
      id: "manage:projects",
      label: "Manage Projects",
      icon: ClipboardCheck,
      href: resolve(`/my/hackathon/${hackathonId}/projects/manage`),
    },
    // Only once a track exists. Tracks are optional, so an entry that is always
    // there says the opposite — and with none defined it leads to an empty list
    // whose only content is the button that creates the first one. That button
    // lives on Settings instead, beside the other things a hackathon either has
    // or does not. The participant surfaces (propose, project edit, overview)
    // already hide themselves the same way.
    ...(trackCount > 0
      ? [
          {
            id: "manage:tracks",
            label: "Manage Tracks",
            icon: Tag,
            href: resolve(`/my/hackathon/${hackathonId}/tracks`),
          },
        ]
      : []),
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
