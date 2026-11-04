import type { Vote } from "$lib/server/grpc/generated/vote/entities/vote"
import type { VoteCategory } from "$lib/server/grpc/generated/vote/entities/vote_category"
import type { VoteResult } from "$lib/server/grpc/generated/vote/entities/vote_result"
import type { TeamServiceClient } from "$lib/server/grpc/generated/hackathon/team_service"
import type { VoteServiceClient } from "$lib/server/grpc/generated/vote/vote_service"
import { teamEntries } from "./submissions"
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
 * `canVoteHere` is deliberately absent — whether *this viewer* may vote on an
 * entry depends on which team they are on. The booth resolves that; this is
 * just what the category is.
 */
export interface CategoryView {
  id: string
  name: string
  description: string
  method: MethodSlug
  methodLabel: string
  maxPoints: number
  /**
   * False for a category the booth cannot offer: a ranked one (no control to
   * cast it) or a jury one (only its roster may vote, and the platform has no
   * jury voting — it is handled off the platform for now). Neither can be
   * created here, only through the API. Such a category is still listed for the
   * organizer rather than hidden: it exists, and pretending otherwise would be
   * worse than saying it is not votable here.
   */
  votableInBooth: boolean
}

/** A team's entry — the thing votes and results both point at. */
export interface BallotSubmission {
  id: string
  teamId: string
  teamName: string
  projectTitle: string
  repositoryUrl: string | undefined
  /** True when the viewer is on the team that filed it. */
  isOwnTeam: boolean
}

/**
 * Every team's *final* submission in one hackathon, which is what is on the
 * ballot and what results are awarded to.
 *
 * The team's entry as `submissionEntry` reads it — its newest final version,
 * the same content its own submissions page shows. A team with no final
 * submission is absent rather than present-and-empty — it has nothing in the
 * running.
 *
 * Shared by the booth, the organizer's results screen and the public results
 * page so the three cannot disagree about what was entered.
 *
 * Read through `teamEntries`, the same as the Submissions page, so the ballot
 * holds exactly the entries that page lists. That returns only the teams whose
 * submissions the viewer may actually read.
 *
 * Empty when team assignments are not published: `TeamService.List` needs
 * `team:read`, and a member holds it only under `CAPABILITY_VIEW_TEAMS`. So
 * **voting silently depends on that capability** — see
 * `TODO(backend: voting-needs-view-teams)` in the voting load, which is where a
 * participant is told, since a helper returning rows has no way to say why there
 * are none.
 */
export async function ballotSubmissions(
  team: TeamServiceClient,
  hackathonId: string,
  projectTitles: Map<string, string>,
  viewerId?: string,
): Promise<BallotSubmission[]> {
  const entries = (await teamEntries(team, hackathonId, new Map())) ?? []

  return entries.flatMap(({ team: t, entry }) =>
    entry
      ? [
          {
            id: entry.id,
            teamId: t.id,
            teamName: t.name,
            projectTitle: projectTitles.get(t.projectId) ?? "Unknown project",
            repositoryUrl: entry.repositoryUrl,
            // SubmitVote refuses a vote on a submission by a team you are on
            // (`vote_service.go:588`), so the booth needs this per submission
            // to leave those off the ballot rather than let someone pick one
            // and take a PermissionDenied. Always false when there is no
            // viewer.
            isOwnTeam:
              viewerId !== undefined &&
              t.members.some((m) => m.id === viewerId),
          },
        ]
      : [],
  )
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
  /**
   * The team that filed the entry, so a placement can link to it — undefined when
   * the submission could not be resolved, which is also when there is no name to
   * show. A row with no `teamId` renders as plain text rather than a link to
   * nowhere.
   */
  teamId: string | undefined
}

/** What a placement is joined against. Built once, by `submissionLookup`. */
export interface SubmissionRef {
  projectTitle: string
  teamName: string
  teamId: string
}

/**
 * Index the hackathon's entries by submission id, which is what a `VoteResult`
 * names.
 *
 * Shared by the participant results page and the organizer's per-category screen
 * so the two cannot disagree about what a placement is *of* — they were building
 * the same map by hand, and only one of them gained `teamId` when placements
 * started linking to teams.
 */
export function submissionLookup(
  submissions: BallotSubmission[],
): Map<string, SubmissionRef> {
  return new Map(
    submissions.map((s) => [
      s.id,
      { projectTitle: s.projectTitle, teamName: s.teamName, teamId: s.teamId },
    ]),
  )
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
  submissions: Map<string, SubmissionRef>,
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
    teamId: sub?.teamId,
  }
}

/**
 * How many people voted, which is not how many votes are stored: a vote row
 * carries one submission, so a points ballot spread over three entries is three
 * rows from one person.
 */
export function voterCount(votes: Pick<Vote, "voterId">[]): number {
  return new Set(votes.map((v) => v.voterId)).size
}

/**
 * How many people have voted in one category — and so whether it is locked.
 * A category anyone has voted in can no longer be edited or deleted: what
 * people voted on has to stay what it was. The backend would allow both (an
 * edit that changes the method even deletes the votes), so the lock is this
 * frontend's rule, applied by every page and action that could change one.
 */
export async function categoryVoterCount(
  vote: VoteServiceClient,
  hackathonId: string,
  categoryId: string,
): Promise<number> {
  const { votes } = await vote.listVotes({ hackathonId, categoryId })
  return voterCount(votes)
}

/**
 * Whether a voting round's results are final: every category anyone voted in
 * has its results. A category nobody voted in never gets any — there is nothing
 * to place — so it does not hold the round back; a round nobody voted in at all
 * has nothing to be final about.
 *
 * The one definition, because two things hang off it: Manage Voting says
 * "Final" and stops offering the button, and Settings lets results be
 * published only once it is true.
 */
export function roundIsFinal(
  categories: { voterCount: number; resultCount: number }[],
): boolean {
  const voted = categories.filter((c) => c.voterCount > 0)
  return voted.length > 0 && voted.every((c) => c.resultCount > 0)
}

/**
 * Where a hackathon's voting round stands, read from the backend for a caller
 * that has nothing loaded — Settings, which uses it to word its switches.
 *
 * `final`: see `roundIsFinal`. `anyVotes`: whether anyone has voted at all —
 * with nobody, there is nothing that could be published too early.
 */
export async function votingRoundStatus(
  vote: VoteServiceClient,
  hackathonId: string,
): Promise<{ final: boolean; anyVotes: boolean }> {
  const [{ voteCategories }, { votes }] = await Promise.all([
    vote.listVoteCategories({ hackathonId }),
    vote.listVotes({ hackathonId }),
  ])
  const categories = await Promise.all(
    voteCategories.map(async (c) => ({
      voterCount: voterCount(votes.filter((v) => v.categoryId === c.id)),
      resultCount: (await vote.listVoteResults({ categoryId: c.id }))
        .voteResults.length,
    })),
  )
  return { final: roundIsFinal(categories), anyVotes: votes.length > 0 }
}

/** One entry's line in the tally. */
export interface TallyRow {
  submissionId: string
  projectTitle: string
  teamName: string
  teamId: string | undefined
  /** Votes (single choice), points, or Borda score (ranked). */
  score: number
  /** Shared by equal scores: 1, 1, 3. */
  rank: number
}

/**
 * The tally `SuggestResults` would save, worked out here so the organizer can
 * see the scores behind the placements. The backend computes them, ranks by
 * them, and stores only the rank (`vote_service.go:1325`, `computeResults`), so
 * without this the page could show "1st" but never "14 points".
 *
 * Mirrors that function and has to stay in step with it: single choice counts
 * one per vote, points sums them, ranked is a Borda count over the entries that
 * received a vote. Only entries with a vote appear, exactly as only they are
 * placed. Ties share a rank and are ordered by title so they don't shuffle.
 */
export function tallyVotes(
  method: MethodSlug,
  votes: Vote[],
  submissions: Map<string, SubmissionRef>,
): TallyRow[] {
  const cast = votes.flatMap((v) => {
    // ts-proto renders the `vote` oneof as three optional fields; whichever is
    // set is the method.
    const submissionId =
      v.singleChoice?.submissionId ??
      v.points?.submissionId ??
      v.ranked?.submissionId
    if (!submissionId) return []
    return [
      {
        submissionId,
        points: v.points?.points ?? 0,
        rank: v.ranked?.rank ?? 0,
      },
    ]
  })

  const entryCount = new Set(cast.map((c) => c.submissionId)).size
  const scores = new Map<string, number>()
  for (const c of cast) {
    const worth =
      method === "points"
        ? c.points
        : method === "ranked"
          ? entryCount - c.rank
          : 1
    scores.set(c.submissionId, (scores.get(c.submissionId) ?? 0) + worth)
  }

  const rows = [...scores].map(([submissionId, score]) => {
    const sub = submissions.get(submissionId)
    return {
      submissionId,
      projectTitle: sub?.projectTitle ?? "Unknown submission",
      teamName: sub?.teamName ?? "",
      teamId: sub?.teamId,
      score,
    }
  })
  rows.sort(
    (a, b) => b.score - a.score || a.projectTitle.localeCompare(b.projectTitle),
  )

  let rank = 0
  let previous: number | undefined
  return rows.map((row, i) => {
    if (row.score !== previous) rank = i + 1
    previous = row.score
    return { ...row, rank }
  })
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
    votableInBooth:
      method !== "ranked" && c.voterType !== VoterType.VOTER_TYPE_JURY,
  }
}
