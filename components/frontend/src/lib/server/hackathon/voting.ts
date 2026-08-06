import type { VoteCategory } from "$lib/server/grpc/generated/vote/entities/vote_category"
import type { VoteResult } from "$lib/server/grpc/generated/vote/entities/vote_result"
import type { TeamServiceClient } from "$lib/server/grpc/generated/hackathon/team_service"
import { submissionVersions } from "./submissions"
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

/** A team's entry — the thing votes and results both point at. */
export interface BallotSubmission {
  id: string
  teamId: string
  teamName: string
  projectTitle: string
  result: string | undefined
  /** True when the viewer is on the team that filed it. */
  isOwnTeam: boolean
}

/**
 * Every team's *final* submission in one hackathon, which is what is on the
 * ballot and what results are awarded to.
 *
 * `latestFinal` rather than `latest`: `CreateSubmission` always writes a draft,
 * and nothing stops a team from filing one after finalizing, so the highest
 * version is not necessarily the entry. A team with no final submission is
 * absent rather than present-and-empty — it has nothing in the running.
 *
 * Shared by the booth, the organizer's results screen and the public results
 * page so the three cannot disagree about what was entered.
 */
export async function ballotSubmissions(
  team: TeamServiceClient,
  hackathonId: string,
  projectTitles: Map<string, string>,
  viewerId?: string,
): Promise<BallotSubmission[]> {
  const { teams } = await team.list({ hackathonId })

  const entries = await Promise.all(
    teams.map(async (t) => {
      const { submissions } = await team.listSubmissions({ teamId: t.id })
      const { latestFinal } = submissionVersions(submissions, new Map())
      if (!latestFinal) return null

      return {
        id: latestFinal.id,
        teamId: t.id,
        teamName: t.name,
        projectTitle: projectTitles.get(t.projectId) ?? "Unknown project",
        result: latestFinal.result,
        // SubmitVote refuses a vote on a submission by a team you are on
        // (`vote_service.go:588`), so the booth needs this per submission to
        // leave those off the ballot rather than let someone pick one and take
        // a PermissionDenied. Always false when there is no viewer.
        isOwnTeam:
          viewerId !== undefined && t.members.some((m) => m.id === viewerId),
      }
    }),
  )

  return entries.filter((e) => e !== null)
}

/** One published placement, joined to what it is a placement *of*. */
export interface ResultView {
  id: string
  submissionId: string
  position: number
  title: string
  /** Resolved from the hackathon's teams; a fallback when the entry is gone. */
  projectTitle: string
  teamName: string
}

/**
 * Order results for display: best placement first, and stable within a tie.
 *
 * `position` is explicitly not unique — the backend lets two submissions share
 * first place and `SuggestResults` produces exactly that for equal scores — so
 * ties are sorted by project title rather than left in whatever order the query
 * returned. Without that a tie reorders itself between page loads.
 */
export function sortResults<
  T extends { position: number; projectTitle: string },
>(results: T[]): T[] {
  return [...results].sort(
    (a, b) =>
      a.position - b.position || a.projectTitle.localeCompare(b.projectTitle),
  )
}

export function resultView(
  r: VoteResult,
  submissions: Map<string, { projectTitle: string; teamName: string }>,
): ResultView {
  const sub = submissions.get(r.submissionId)

  return {
    id: r.id,
    submissionId: r.submissionId,
    position: r.position,
    title: r.title ?? "",
    // A result outlives nothing in particular — the submission it points at is
    // still there — but a team whose submission the viewer cannot resolve would
    // otherwise render as a blank row.
    projectTitle: sub?.projectTitle ?? "Unknown submission",
    teamName: sub?.teamName ?? "",
  }
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
