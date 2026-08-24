import type { HackathonMember } from "$lib/server/grpc/generated/hackathon/entities/hackathon_member"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import type { User } from "$lib/server/grpc/generated/user/entities/user"

/**
 * Server-only: reads the generated `HackathonMember` type, so it must never be
 * imported by a component.
 *
 * Ownership and participation are separate records in the backend, and `Create`
 * writes only the first: it grants the creator the casbin `owner` role and adds
 * them to the hackathon's owners edge, but never a Participant row. Since
 * `Get` builds its member list from that table, an organiser opening the
 * hackathon they just made matches nobody in it — which every `may*` gate in
 * `capabilities.ts` reads as "no relationship" and hides itself for.
 *
 * These helpers close that gap on the read path by treating an owner with no
 * participant row as a confirmed owner, which is what the seed fixture writes
 * explicitly and what `Create` would produce if it enrolled the creator.
 */

/**
 * The membership an owner holds by virtue of the owners edge alone.
 *
 * `HACKATHON_ROLE_OWNER` because that is the casbin role `Create` and `AddOwner`
 * do grant, so this reports what `GetHackathonRole` would have reported had
 * there been a participant row to report it against. Confirmed rather than
 * waitlisted because owning is not pending anyone's approval — `isWaiting`
 * outranks `role` everywhere it is read, so getting this wrong would withhold
 * every owner control rather than just mislabel a chip.
 *
 * Stated in one place because the two callers must agree: the dashboard uses it
 * to decide whether a row links anywhere at all (`canOpenHackathon`), and the
 * hackathon layout to decide which half of the nav exists.
 *
 * @param user the owner, where the caller has them. `List` populates `owners`
 *   only on `Get` responses, so the dashboard has an id and no `User` — nothing
 *   reads this field off a synthesised row, and the alternative is a per-row
 *   lookup for a value only the real rows use.
 * @param joinedAt the hackathon's creation time, the closest thing to a join
 *   date an owner who never joined has.
 */
export function ownerMembership(
  user: User | undefined,
  joinedAt: Date | undefined,
): HackathonMember {
  return {
    user,
    role: HackathonRole.HACKATHON_ROLE_OWNER,
    isWaiting: false,
    joinedAt,
  }
}

/**
 * The viewer's own participant row, if the backend holds one.
 *
 * The only honest test for whether someone *takes part* in a hackathon, as
 * against merely having a relationship to it. Neither of the obvious answers
 * works: `role` reports `OWNER` for an owner whether or not they also hold
 * `MEMBER`, because `GetHackathonRole` returns the first match and checks Owner
 * first (`rbac.go:402`); and `viewerMembership` below hands an owner with no row
 * a synthesised one that is indistinguishable from a confirmed membership.
 *
 * Used by `viewerMembership` below, and by the team formation page to say why an
 * organiser is missing from the pool it staffs teams from — an absence that
 * otherwise reads as the page having lost them.
 *
 * @param platformUserId the viewer's backend user id, not their Keycloak id.
 */
export function participantRowFor(
  members: HackathonMember[],
  platformUserId: string | undefined,
): HackathonMember | undefined {
  if (platformUserId === undefined) return undefined

  return members.find((m) => m.user?.id === platformUserId)
}

/**
 * The viewer's relationship to one hackathon, from a `Get` response.
 *
 * A real participant row wins outright, even for an owner: it is the record the
 * backend will actually consult, and an owner who *did* join has a genuine
 * `isWaiting` worth honouring rather than overwriting with `false`.
 *
 * Only the owner half is ever synthesised. The member-gated actions — voting,
 * proposing a project, setting a preference — stay keyed on the real row,
 * because the casbin `member` role that permits them arrives with
 * `ApproveParticipant` and an owner holds no more of it than their participant
 * row implies. Claiming membership here would offer those controls and have the
 * backend refuse them.
 *
 * @param platformUserId the viewer's backend user id, not their Keycloak id —
 *   what `Get` reports in both collections. Undefined for a viewer with no
 *   platform user, who can hold neither record.
 */
export function viewerMembership(
  members: HackathonMember[],
  owners: User[],
  platformUserId: string | undefined,
  createdAt: Date | undefined,
): HackathonMember | null {
  if (platformUserId === undefined) return null

  const participant = participantRowFor(members, platformUserId)
  if (participant !== undefined) return participant

  const owner = owners.find((o) => o.id === platformUserId)

  return owner !== undefined ? ownerMembership(owner, createdAt) : null
}
