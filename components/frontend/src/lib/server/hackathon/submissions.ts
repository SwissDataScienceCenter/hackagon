import type { Submission } from "$lib/server/grpc/generated/hackathon/entities/submission"
import { SubmissionStatus } from "$lib/server/grpc/generated/hackathon/entities/submission_status"
import type { Team } from "$lib/server/grpc/generated/hackathon/entities/team"
import type { TeamServiceClient } from "$lib/server/grpc/generated/hackathon/team_service"
import {
  SUBMISSION_STANDINGS,
  type SubmissionStanding,
} from "$lib/utils/submissionFilter"

/**
 * Server-only: reads the generated `Submission` type, so it must never be
 * imported by a component.
 */

/** One version of a team's submission, as the page renders it. */
export interface SubmissionVersion {
  id: string
  version: number
  status: SubmissionStatus
  result: string | undefined
  createdAt: Date | undefined
  creator: string | undefined
  /** Set only on a final version — see `submissionVersions`. */
  finalizedAt: Date | undefined
  /** Set only on a final version whose modifier is still a known member. */
  finalizedBy: string | undefined
}

export interface TeamSubmissions {
  /** Highest version, whatever its status. Null when the team has none. */
  latest: SubmissionVersion | null
  /** Highest *final* version — the team's actual entry. */
  latestFinal: SubmissionVersion | null
  /** Everything `latest`/`latestFinal` don't cover, newest first. */
  earlier: SubmissionVersion[]
}

/**
 * Split a team's submissions into the two that get shown prominently and the
 * rest.
 *
 * `latest` and `latestFinal` are tracked separately because they are not always
 * the same row: `CreateSubmission` always writes a **draft**
 * (`team_service.go:476`) and nothing stops a team from creating one after
 * finalizing, so a draft can sit on top of the version that actually counts.
 * Showing only the highest version would then misreport a finalized entry as
 * unfinalized.
 *
 * `earlier` excludes both, or a final version pushed out of last place by a
 * newer draft would render twice.
 *
 * @param submissions in any order — sorted here, since `ListSubmissions`'
 *   ordering is not part of its contract.
 * @param memberNames user id → display name, for resolving creator/modifier.
 */
export function submissionVersions(
  submissions: Submission[],
  memberNames: Map<string, string>,
): TeamSubmissions {
  const views = [...submissions]
    .sort((a, b) => a.version - b.version)
    .map((s) => {
      const isFinal = s.status === SubmissionStatus.SUBMISSION_STATUS_FINAL

      return {
        id: s.id,
        version: s.version,
        status: s.status,
        result: s.result,
        createdAt: s.createdAt,
        creator: memberNames.get(s.creatorId),
        // `modifier`/`modified_at` are not "last edited": a submission's content
        // is immutable and `FinalizeSubmission` is the only writer of either
        // (`team_service.go:649-651`), so they mean "who finalized it, and
        // when". On a draft they merely echo creation, hence undefined — and
        // surfacing them as finalization keeps a version finalized by someone
        // other than its author from reading as though the author did it.
        finalizedAt: isFinal ? s.modifiedAt : undefined,
        finalizedBy:
          isFinal && s.modifierId ? memberNames.get(s.modifierId) : undefined,
      }
    })

  const latest = views.at(-1) ?? null
  const latestFinal =
    views.findLast(
      (v) => v.status === SubmissionStatus.SUBMISSION_STATUS_FINAL,
    ) ?? null

  return {
    latest,
    latestFinal,
    earlier: views
      .filter((v) => v.id !== latest?.id && v.id !== latestFinal?.id)
      .reverse(),
  }
}

/**
 * Where a team stands: nothing filed, only drafts, or a final entry.
 *
 * Read off `latestFinal` rather than `latest`, for the reason `submissionVersions`
 * keeps the two apart — a draft created after finalizing does not take the
 * team's entry back, so that team is still `final`.
 */
export function submissionStanding(s: TeamSubmissions): SubmissionStanding {
  if (s.latestFinal) return "final"

  return s.latest ? "draft" : "missing"
}

/** One team on Manage Submissions — and one line of its export. */
export interface TeamSubmissionRow extends TeamSubmissions {
  teamId: string
  teamName: string
  projectTitle: string
  /** Current members by name, sorted — who an organiser would chase. */
  members: string[]
  standing: SubmissionStanding
}

/**
 * Every team's submissions, keyed by team id.
 *
 * One `ListSubmissions` per team, in parallel: `TeamService.List` returns teams
 * without their submissions (`team_service.go:63-68`), and there is no RPC that
 * lists a hackathon's submissions in one go.
 *
 * TODO(backend: submissions-hackathon-list): one call once the backend offers
 * one — either `List` loading the submissions edge that `Get` already loads, or
 * a hackathon-scoped `ListSubmissions`.
 *
 * `ListSubmissions` rather than the submissions nested in `team.get`, for the
 * same reason the participant page gives: only this one is meant to be complete.
 * Nothing is caught: an owner holds `submission:read` hackathon-wide
 * (`rbac.go:238`), so a refusal here is a real fault worth surfacing.
 */
export async function submissionsByTeam(
  team: TeamServiceClient,
  teams: Team[],
): Promise<Map<string, Submission[]>> {
  const lists = await Promise.all(
    teams.map(async (t) => {
      const { submissions } = await team.listSubmissions({ teamId: t.id })

      return [t.id, submissions] as const
    }),
  )

  return new Map(lists)
}

/**
 * Every team as a row of the organiser's overview, sorted the way it is shown:
 * by standing, the teams with nothing first and the finished ones last, then
 * by name.
 *
 * Problems first because the page is for finding who still owes an entry — the
 * teams that are done are the ones nobody has to do anything about. Ties go by
 * team name, not by activity, so a row does not move every time a team saves.
 *
 * @param projectTitles project id → title; a team whose project is missing from
 *   it shows "Unknown project" rather than dropping out of the overview.
 * @param memberNames user id → name, for creators and finalizers — see
 *   `submissionVersions`.
 */
export function submissionOverview(
  teams: Team[],
  byTeam: Map<string, Submission[]>,
  projectTitles: Map<string, string>,
  memberNames: Map<string, string>,
): TeamSubmissionRow[] {
  const rank = (s: SubmissionStanding) => SUBMISSION_STANDINGS.indexOf(s)

  return teams
    .map((t) => {
      const versions = submissionVersions(byTeam.get(t.id) ?? [], memberNames)

      return {
        teamId: t.id,
        teamName: t.name,
        projectTitle: projectTitles.get(t.projectId) ?? "Unknown project",
        members: t.members
          .map((m) => m.displayName || m.username)
          .sort((a, b) => a.localeCompare(b)),
        standing: submissionStanding(versions),
        ...versions,
      }
    })
    .sort(
      (a, b) =>
        rank(a.standing) - rank(b.standing) ||
        a.teamName.localeCompare(b.teamName),
    )
}
