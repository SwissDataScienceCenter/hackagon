/**
 * Where a capability is exercised.
 *
 * The point of naming a capability on screen ("You can now: propose a project")
 * is that someone then goes and does it, so each open capability becomes a link
 * to the page that does the thing.
 *
 * Adapted from main, with our route names: main sends VIEW_RESULTS to a
 * dedicated `/results` page, and ours folds results into `/voting`.
 *
 * Raw numbers rather than the generated enum, because Svelte components import
 * this and `$lib/server/**` is server-only. Values are fixed by the proto and
 * are identical on both branches:
 *
 *   1 REGISTER   2 PROPOSE_PROJECTS   3 SET_TEAM_PREFERENCES
 *   4 CREATE_PROJECT_SUBMISSIONS      5 VOTE   6 VIEW_RESULTS
 */
const PROPOSE_PROJECTS = 2
const SET_TEAM_PREFERENCES = 3
const CREATE_PROJECT_SUBMISSIONS = 4
const VOTE = 5
const VIEW_RESULTS = 6

/**
 * The page that exercises a capability, or undefined when there is none.
 *
 * REGISTER deliberately returns nothing: by the time a member reads this card
 * they have already registered, so a link to the join flow would be a link
 * backwards.
 */
export function capabilityHref(
  hackathonId: string,
  capability: number,
): string | undefined {
  switch (capability) {
    case PROPOSE_PROJECTS:
      return `/my/hackathon/${hackathonId}/projects/proposals/propose`
    case SET_TEAM_PREFERENCES:
      return `/my/hackathon/${hackathonId}/projects`
    case CREATE_PROJECT_SUBMISSIONS:
      return `/my/hackathon/${hackathonId}/submissions`
    case VOTE:
      return `/my/hackathon/${hackathonId}/voting`
    case VIEW_RESULTS:
      return `/my/hackathon/${hackathonId}/voting`
    default:
      return undefined
  }
}

/** Human label for a capability, for the "you can now" list. */
const LABELS: Partial<Record<number, string>> = {
  1: "Register",
  2: "Propose a project",
  3: "Set team preferences",
  4: "Turn work in",
  5: "Vote",
  6: "See the results",
}

export function capabilityLabel(capability: number): string | undefined {
  return LABELS[capability]
}

/**
 * CapabilityState: 1 COMING, 2 OPEN, 3 CLOSED, 4 UNGOVERNED.
 *
 * UNGOVERNED means nobody has scheduled this capability, which the backend
 * treats as permitted — `Allowed` returns true for it — so the card must too,
 * or it would tell people they cannot do something the server will happily let
 * them do.
 */
export function isOpen(state: number): boolean {
  return state === 2 || state === 4
}

/** COMING is "not yet", CLOSED is "no longer" — worth saying differently. */
export function isComing(state: number): boolean {
  return state === 1
}
