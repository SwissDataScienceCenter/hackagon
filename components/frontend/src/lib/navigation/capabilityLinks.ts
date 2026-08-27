// Where a participant goes to use a capability that is switched on.
//
// Lives beside `items.ts` because both own route knowledge, but in its own
// module: `items.ts` pulls the lucide icon barrel in behind it, and a component
// that only wants one href should not drag that along.

import { resolve } from "$app/paths"

// Capability enum numbers, stated here as they are in `$lib/utils/phase` —
// the generated enum is server-only and this module is imported by a component.
const PROPOSE_PROJECTS = 2
const SET_TEAM_PREFERENCES = 3
const CREATE_PROJECT_SUBMISSIONS = 4
const VOTE = 5
const VIEW_RESULTS = 6
const VIEW_TEAMS = 7

/**
 * The route that lets a participant do this, or undefined where there is none.
 *
 * `CAPABILITY_REGISTER` is the one with no destination inside a hackathon:
 * joining happens on the dashboard, and anyone reading this is already in. It
 * is still worth *listing* as open or closed — whether sign-ups are running is
 * information a participant acts on, they just do not act on it here.
 *
 * TODO(backend: project-preferences-capability): `SET_TEAM_PREFERENCES` points
 * at the project list, where the "mark as preferred" control is shown to every
 * confirmed participant regardless of the capability — `mayPreferProjects`
 * deliberately does not mirror it, since the capability grants `project:join`
 * only to `Member` and casbin has no inheritance, so mirroring it would hide the
 * control from owners permanently. Until that is fixed this card can say
 * "not open" while the control is still visible on the page it links to. Once an
 * owner can hold the permission, `mayPreferProjects` gates on the capability and
 * the two agree.
 */
export function capabilityHref(
  hackathonId: string,
  capability: number,
): string | undefined {
  switch (capability) {
    case PROPOSE_PROJECTS:
      return resolve(`/my/hackathon/${hackathonId}/projects/propose`)
    case SET_TEAM_PREFERENCES:
      return resolve(`/my/hackathon/${hackathonId}/projects`)
    case CREATE_PROJECT_SUBMISSIONS:
      return resolve(`/my/hackathon/${hackathonId}/submissions`)
    case VOTE:
      return resolve(`/my/hackathon/${hackathonId}/voting`)
    case VIEW_RESULTS:
      return resolve(`/my/hackathon/${hackathonId}/results`)
    // The teams list itself. Unlike the five above, this capability does not
    // unlock an *action* — it decides whether the page can be read at all, since
    // `TeamService.List` requires `team:read` (`team_service.go:59`). So the
    // destination is the page rather than a control on it.
    case VIEW_TEAMS:
      return resolve(`/my/hackathon/${hackathonId}/teams`)
    default:
      return undefined
  }
}
