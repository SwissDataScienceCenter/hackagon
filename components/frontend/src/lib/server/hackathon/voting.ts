import type { VoteCategory } from "$lib/server/grpc/generated/vote/entities/vote_category"
import { VotingMethod } from "$lib/server/grpc/generated/vote/entities/voting_method"
import { VoterType } from "$lib/server/grpc/generated/vote/entities/voter_type"

/**
 * Server-only: reads generated types, so it must never be imported by a
 * component. Loads call these and hand plain objects down, which is why the
 * view models below carry resolved labels rather than enum values.
 */

/** The form's wire value for a voting method, and what the loads round-trip. */
export type MethodSlug = "single_choice" | "ranked" | "points"

const METHOD_SLUGS: Partial<Record<VotingMethod, MethodSlug>> = {
  [VotingMethod.VOTING_METHOD_SINGLE_CHOICE]: "single_choice",
  [VotingMethod.VOTING_METHOD_RANKED]: "ranked",
  [VotingMethod.VOTING_METHOD_POINTS]: "points",
}

const METHOD_LABELS: Record<MethodSlug, string> = {
  single_choice: "Single choice",
  ranked: "Ranked",
  points: "Points",
}

/**
 * Wire value → enum, for the two methods the category form offers.
 *
 * `ranked` is absent on purpose rather than by omission: the booth has no
 * drag-to-order control, so a category created as ranked could be listed and
 * tallied but never voted on. Returning undefined makes the action reject the
 * value instead of creating a category nobody can use. Add it here the day the
 * booth grows the control.
 */
export function methodFromSlug(value: string): VotingMethod | undefined {
  if (value === "single_choice") return VotingMethod.VOTING_METHOD_SINGLE_CHOICE
  if (value === "points") return VotingMethod.VOTING_METHOD_POINTS

  return undefined
}

/** Enum → wire value. Unknown/unspecified falls back to single choice. */
export function slugFromMethod(method: VotingMethod): MethodSlug {
  return METHOD_SLUGS[method] ?? "single_choice"
}

/**
 * One category, flattened for display.
 *
 * `canVoteHere` is deliberately absent — whether *this viewer* may vote in this
 * category depends on the jury roster and, per submission, on which team they
 * are on. The booth resolves both; this is just what the category is.
 */
export interface CategoryView {
  id: string
  name: string
  description: string
  method: MethodSlug
  methodLabel: string
  maxPoints: number
  isJury: boolean
  juryMemberIds: string[]
  /**
   * True for a method the booth cannot cast a vote for — today, ranked. Such a
   * category is still shown rather than hidden: it exists, an organizer made it,
   * and pretending otherwise would be worse than saying it is not votable here.
   */
  votableInBooth: boolean
}

export function categoryView(c: VoteCategory): CategoryView {
  const method = slugFromMethod(c.votingMethod)

  return {
    id: c.id,
    name: c.name,
    description: c.description,
    method,
    methodLabel: METHOD_LABELS[method],
    // The field is optional on the wire and only meaningful for points; 0 reads
    // as "unset" everywhere downstream.
    maxPoints: c.maxPoints ?? 0,
    isJury: c.voterType === VoterType.VOTER_TYPE_JURY,
    juryMemberIds: c.juryMembers.map((u) => u.id),
    votableInBooth: method !== "ranked",
  }
}
