/**
 * Where a page's back link leads: the page the reader came from.
 *
 * Remembered per browser history entry, in SvelteKit's page state, so Back and
 * Forward through several pages each show their own. The app layout records it
 * on every navigation inside the app (see `backTrail.svelte.ts`); `BackLink`
 * reads it, and falls back to the page's own list when there is nothing — a
 * fresh tab, a bookmark or a reload, since SvelteKit does not restore page state
 * on the first page a browser loads.
 */
export interface Back {
  /** The page to return to: a path of this app, with its query. */
  href: string
  /** "Back to voting", or plain "Back" for a page not in `BACK_NAMES`. */
  label: string
  /**
   * Whether that page is the history entry right before this one, so the link
   * can be a browser Back — which restores where the reader had scrolled. False
   * once this page has changed its own query and so added entries of its own.
   */
  adjacent: boolean
}

const HACKATHON = "/(app)/my/hackathon/[id]"

/**
 * What a page is called in "Back to …", by route id. A page left out still
 * gets a working link, labelled plain "Back". A test checks every key is a
 * route that exists, so a renamed route fails rather than going quiet.
 */
export const BACK_NAMES: Record<string, string> = {
  "/(app)/dashboard": "the dashboard",
  "/(app)/account": "your account",
  "/(app)/manage/hackathons": "Manage Hackathons",
  "/(app)/manage/users": "users",
  "/(app)/manage/users/[id]": "the user",
  [`${HACKATHON}/overview`]: "the overview",
  [`${HACKATHON}/manage`]: "Manage",
  [`${HACKATHON}/manage/forms/registration/answers`]: "registration answers",
  [`${HACKATHON}/pages/[pageId]`]: "the page",
  [`${HACKATHON}/participants`]: "participants",
  [`${HACKATHON}/participants/[participantId]`]: "the profile",
  [`${HACKATHON}/participants/[participantId]/answers`]: "the answers",
  [`${HACKATHON}/participants/manage`]: "Manage Participants",
  [`${HACKATHON}/participants/manage/waitlist`]: "Waitlist",
  [`${HACKATHON}/participants/manage/[participantId]`]: "the participant",
  [`${HACKATHON}/projects`]: "projects",
  [`${HACKATHON}/projects/mine`]: "my projects",
  [`${HACKATHON}/projects/[projectId]`]: "the project",
  [`${HACKATHON}/projects/manage`]: "Manage Projects",
  [`${HACKATHON}/projects/manage/[projectId]`]: "the project",
  [`${HACKATHON}/teams`]: "teams",
  [`${HACKATHON}/teams/[teamId]`]: "the team",
  [`${HACKATHON}/teams/manage`]: "Manage Teams",
  [`${HACKATHON}/submissions`]: "submissions",
  [`${HACKATHON}/submissions/mine`]: "our submission",
  [`${HACKATHON}/submissions/[teamId]`]: "the submission",
  [`${HACKATHON}/submissions/manage`]: "Manage Submissions",
  [`${HACKATHON}/timeline`]: "the timeline",
  [`${HACKATHON}/voting`]: "voting",
  [`${HACKATHON}/voting/manage`]: "Manage Voting",
  [`${HACKATHON}/results`]: "results",
}

/**
 * Pages that are a form: never a place to go back to. Saving one redirects to
 * the thing it saved, and Back from there should not reopen the form — the
 * reader gets the page's own list instead.
 */
const FORM_ROUTE = /\/(edit|new|propose|create)$/

/**
 * The back target for the page a navigation lands on.
 *
 * @param from the page being left; null on the first page a browser loads.
 * @param to the page being opened.
 * @param fromBack the page being left's own back target, carried over when the
 *   navigation only changes that page's query.
 * @returns undefined when the page's own list is the way back.
 */
export function backFor(
  from: { url: URL; routeId: string | null } | null,
  to: { url: URL },
  fromBack: Back | undefined,
): Back | undefined {
  if (!from) return undefined

  // The same page with another query — a tab, a filter, `?edit=`. Still the
  // same way back, but no longer one step away.
  if (from.url.pathname === to.url.pathname) {
    return fromBack && { ...fromBack, adjacent: false }
  }

  if (from.routeId === null || FORM_ROUTE.test(from.routeId)) return undefined

  const name = BACK_NAMES[from.routeId]
  return {
    href: from.url.pathname + from.url.search,
    label: name ? `Back to ${name}` : "Back",
    adjacent: true,
  }
}
