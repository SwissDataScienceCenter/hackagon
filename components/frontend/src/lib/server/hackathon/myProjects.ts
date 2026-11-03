import type { Hackathon } from "$lib/server/grpc/generated/hackathon/entities/hackathon"
import type { Project } from "$lib/server/grpc/generated/hackathon/entities/project"
import { participantRowFor } from "$lib/server/hackathon/membership"

/**
 * The projects the viewer proposed in this hackathon, at every status, newest
 * first — what the sidebar's My projects entry counts and its page lists. One
 * function for both, so the entry is never offered for a page that comes up
 * empty.
 *
 * **Only for a confirmed participant.** An owner can propose without taking part
 * — they hold `project:propose` as a default policy, not through membership —
 * and their proposals are theirs to manage from Manage Projects, so My projects
 * is the participant's view of what they put forward. `role` cannot make that
 * call: it reports OWNER whether or not the owner also joined. The participant
 * row can, which is why this goes through `participantRowFor`. A waitlisted
 * participant counts as not yet taking part, the same as everywhere else.
 *
 * Not gated on the phase or on `CAPABILITY_PROPOSE_PROJECTS`: closing proposals
 * stops new ones, it does not take away the ones already made.
 *
 * Frontend-only, like every reading of `hackathon.projects`: `Get` returns every
 * project to every member, so this shapes the UI rather than enforcing anything.
 *
 * @param platformUserId the viewer's backend user id, not their Keycloak id.
 */
export function myProjects(
  hackathon: Pick<Hackathon, "members" | "projects">,
  platformUserId: string | undefined,
): Project[] {
  const row = participantRowFor(hackathon.members, platformUserId)
  if (row === undefined || row.isWaiting) return []

  return hackathon.projects
    .filter((p) => p.creatorId === platformUserId)
    .sort(
      (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
    )
}
