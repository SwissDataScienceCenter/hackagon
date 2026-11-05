// What one open capability means for the participant reading the overview.
//
// `capabilityHref` answers "where is this done", the same for everyone. This
// answers "where do *you* stand with it": a capability someone has already used
// reads as done and points at what they did, one they have not reads as the
// next thing to do. Both live in this folder because both own route knowledge.

import { resolve } from "$app/paths"

// Capability enum numbers, stated here as they are in `$lib/utils/phase` —
// the generated enum is server-only and this module is imported by a component.
const PROPOSE_PROJECTS = 2
const SET_TEAM_PREFERENCES = 3
const CREATE_PROJECT_SUBMISSIONS = 4
const VOTE = 5
const VIEW_RESULTS = 6
const VIEW_TEAMS = 7

/** What the overview already knows about the viewer's own part in a hackathon. */
export interface MyProgress {
  /** Projects the viewer proposed here, at any status. */
  proposedCount: number
  /** Projects the viewer marked as preferred. */
  preferredCount: number
  /**
   * The viewer's team. Null both when they are on none and when assignments
   * are not published — either way there is no team to point at.
   */
  team: { id: string; name: string; submissionCount: number } | null
}

export interface NextStep {
  label: string
  description: string
  /** Already done by the viewer: drawn with a check rather than an open circle. */
  done: boolean
  /** Undefined where there is nowhere to send them. */
  href?: string
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

/**
 * The row for one switched-on capability, or undefined where it has none.
 *
 * `CAPABILITY_REGISTER` is the one without: anyone reading the overview has
 * already joined, and the waitlisted case has its own line on the card. Nothing
 * in a row tells them anything they can act on.
 *
 * Vote has a single state because nothing the frontend loads says whether the
 * viewer has voted yet. Results has one because there is nothing to have done.
 */
export function nextStep(
  hackathonId: string,
  capability: number,
  progress: MyProgress,
): NextStep | undefined {
  switch (capability) {
    case PROPOSE_PROJECTS:
      return progress.proposedCount > 0
        ? {
            label: `You proposed ${plural(progress.proposedCount, "project", "projects")}`,
            description: "See how their review is going, or propose another.",
            done: true,
            href: resolve(`/my/hackathon/${hackathonId}/projects/mine`),
          }
        : {
            label: "Propose a project",
            description: "Pitch an idea for the organizers to review.",
            done: false,
            href: resolve(`/my/hackathon/${hackathonId}/projects/propose`),
          }
    case SET_TEAM_PREFERENCES:
      return progress.preferredCount > 0
        ? {
            label: `You picked ${plural(progress.preferredCount, "project", "projects")}`,
            description: "You can change your picks while this is open.",
            done: true,
            href: resolve(`/my/hackathon/${hackathonId}/projects`),
          }
        : {
            label: "Pick projects you'd like to work on",
            description: "Organizers use your picks to form teams.",
            done: false,
            href: resolve(`/my/hackathon/${hackathonId}/projects`),
          }
    case VIEW_TEAMS:
      return progress.team
        ? {
            label: `You're on ${progress.team.name}`,
            description: "See who you're working with.",
            done: true,
            href: resolve(
              `/my/hackathon/${hackathonId}/teams/${progress.team.id}`,
            ),
          }
        : {
            label: "Teams are out",
            description: "You're not on a team yet. See who is where.",
            done: false,
            href: resolve(`/my/hackathon/${hackathonId}/teams`),
          }
    case CREATE_PROJECT_SUBMISSIONS:
      // No team, nothing to submit against: say why rather than link into a
      // page that has nothing for them.
      if (!progress.team) {
        return {
          label: "Hand in your team's work",
          description: "You need a team to submit.",
          done: false,
        }
      }
      return progress.team.submissionCount > 0
        ? {
            label: "Your team has submitted",
            description: "You can still update it while submissions are open.",
            done: true,
            href: resolve(`/my/hackathon/${hackathonId}/submissions/mine`),
          }
        : {
            label: "Hand in your team's work",
            description: "Nothing submitted yet.",
            done: false,
            href: resolve(`/my/hackathon/${hackathonId}/submissions/mine`),
          }
    case VOTE:
      return {
        label: "Cast your votes",
        description: "Voting is open.",
        done: false,
        href: resolve(`/my/hackathon/${hackathonId}/voting`),
      }
    case VIEW_RESULTS:
      return {
        label: "See the results",
        description: "The results are out.",
        done: false,
        href: resolve(`/my/hackathon/${hackathonId}/results`),
      }
    default:
      return undefined
  }
}
