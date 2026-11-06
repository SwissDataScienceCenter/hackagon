import type { Submission } from "$lib/server/grpc/generated/hackathon/entities/submission"
import { SubmissionStatus } from "$lib/server/grpc/generated/hackathon/entities/submission_status"
import type { Team } from "$lib/server/grpc/generated/hackathon/entities/team"
import type { TeamServiceClient } from "$lib/server/grpc/generated/hackathon/team_service"
import { ClientError, Status } from "nice-grpc-common"
import { listVisibleTeams } from "./teams"
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
  /**
   * The proto's `result`, under the name the backend means it by — see the
   * mapping in `submissionVersions`. Older versions may hold free-text notes
   * rather than a link, from before the backend required https.
   */
  repositoryUrl: string | undefined
  /** A link to a folder of slides, data or a video — anything not in the repo. */
  attachmentFolderUrl: string | undefined
  /** Markdown, as the team typed it. */
  description: string | undefined
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
        // TODO(backend: submission-repository-url): `result` is the repository
        // URL, and the backend plans to rename it `repository_url` after the
        // hackathon. This is the one line that changes when it does.
        repositoryUrl: s.result,
        attachmentFolderUrl: s.attachmentFolderUrl,
        description: s.description,
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
 * A team's submission as one thing it edits in place — the way every page shows
 * it, whatever versions sit underneath.
 */
export interface SubmissionEntry {
  /** The version this content lives on — what votes and placements point at. */
  id: string
  /** The proto's `result` — see the mapping in `submissionEntry`. */
  repositoryUrl: string | undefined
  /** A link to a folder of slides, data or a video — anything not in the repo. */
  attachmentFolderUrl: string | undefined
  /** Markdown, as the team typed it. */
  description: string | undefined
  /** When this content was saved. */
  updatedAt: Date | undefined
  /** Who saved it; unset when they are no longer a member. */
  updatedBy: string | undefined
}

/**
 * The team's entry: its newest *final* version, or null when it has none.
 *
 * The backend keeps every save as a version, a draft until finalized. The
 * frontend hides that: each save creates a version and finalizes it at once
 * (the participant page's save action), so the newest final version is always
 * what the team last saved. Drafts are ignored — a team holding only drafts has
 * no entry, as on the ballot, and a draft left on top of a final by an earlier
 * save does not replace it.
 *
 * TODO(backend: submission-edit-in-place): one submission per team and project,
 * updated by an update/upsert RPC, with `version` and `status` dropped and votes
 * and results moved onto the row that is kept. This then reads that row, and
 * the save action stops finalizing.
 *
 * `updatedAt`/`updatedBy` are the version's creation, not its `modified_at`:
 * a version's content never changes, and `modifier` only says who finalized it,
 * which on older data need not be who wrote it.
 *
 * @param submissions in any order — sorted here, since `ListSubmissions`'
 *   ordering is not part of its contract.
 * @param memberNames user id → display name, for resolving who saved it.
 */
export function submissionEntry(
  submissions: Submission[],
  memberNames: Map<string, string>,
): SubmissionEntry | null {
  const final = [...submissions]
    .sort((a, b) => a.version - b.version)
    .findLast((s) => s.status === SubmissionStatus.SUBMISSION_STATUS_FINAL)
  if (!final) return null

  return {
    id: final.id,
    // TODO(backend: submission-repository-url): `result` is the repository
    // URL, and the backend plans to rename it `repository_url` after the
    // hackathon. This is the one line that changes when it does.
    repositoryUrl: final.result,
    attachmentFolderUrl: final.attachmentFolderUrl,
    description: final.description,
    updatedAt: final.createdAt,
    updatedBy: memberNames.get(final.creatorId),
  }
}

/** One team the viewer may see, with its entry when it has one. */
export interface TeamEntry {
  team: Team
  entry: SubmissionEntry | null
}

/**
 * Every team the viewer may see in one hackathon, each with its entry — what
 * the Submissions page lists, and what is on the ballot.
 *
 * Shared so the two cannot disagree about what a team entered.
 *
 * Undefined when team assignments are not published: `TeamService.List` needs
 * `team:read`, and a member holds it only under `CAPABILITY_VIEW_TEAMS`. A team
 * whose submissions the viewer may not read comes back with a null entry, the
 * same as one that has none — see the per-team catch below.
 *
 * @param memberNames user id → display name, for who saved each entry.
 */
export async function teamEntries(
  team: TeamServiceClient,
  hackathonId: string,
  memberNames: Map<string, string>,
): Promise<TeamEntry[] | undefined> {
  const teams = await listVisibleTeams(team, hackathonId)
  if (teams === undefined) return undefined

  return Promise.all(
    teams.map(async (t) => {
      // TODO(backend: submission-cross-team-read) — replace this with the
      // hackathon-wide, finals-only read once it exists, and drop the catch.
      //
      // `Get`, not `ListSubmissions`. `ListSubmissions` takes `submission:read`
      // scoped to the team (`team_service.go:560`) and the only unscoped grant
      // goes to `Owner`; no capability widens it — CAPABILITY_VOTE grants a
      // member `vote:create` and `vote_category:read`, CAPABILITY_VIEW_RESULTS
      // grants `vote_result:read`, and neither adds `submission:read`
      // (`hackathon_service.go:653,713`). So it refused a participant for every
      // team but their own, which left the ballot empty: the single entry they
      // could resolve was their own team's, and that is the one entry
      // `SubmitVote` refuses (`vote_service.go:588`).
      //
      // `Get` eager-loads a team's submissions and gates on hackathon-scoped
      // `team:read` (`team_service.go:114` — it asked for `hackathon:read`
      // until the view-teams capability landed), so it is the one read that
      // hands a participant another team's entry, and only while assignments
      // are published. That is the same grant `List` above needs, so a viewer
      // who got a list can resolve every row in it. Nothing extra reaches the
      // browser: `submissionEntry` keeps the final entry and this function
      // returns only that, so the drafts `Get` over-shares are dropped
      // server-side — the same containment the team detail page relies on.
      //
      // The catch stays as a guard rather than a workaround: if the fix lands as
      // "`Get` now enforces `submission:read`" without a member-wide policy,
      // every call here starts refusing, and an unguarded await would take the
      // page down with a 500 instead of losing one row. Skipping a team degrades
      // — `resultView` renders an unresolvable placement as "Unknown
      // submission", and a ballot missing one entry is still a ballot.
      try {
        const { team: full } = await team.get({ teamId: t.id })

        return {
          team: t,
          entry: submissionEntry(full?.submissions ?? [], memberNames),
        }
      } catch (e) {
        if (
          e instanceof ClientError &&
          (e.code === Status.PERMISSION_DENIED || e.code === Status.NOT_FOUND)
        ) {
          return { team: t, entry: null }
        }
        throw e
      }
    }),
  )
}

/** One team on Manage Submissions — and one line of its export. */
export interface TeamSubmissionRow {
  teamId: string
  teamName: string
  projectTitle: string
  /** The project's image: a team has none of its own. */
  imageUrl: string | undefined
  /** Current members by name, sorted — who an organiser would chase. */
  members: string[]
  standing: SubmissionStanding
  /** As `submissionEntry` reads it; null for a team that has none. */
  entry: SubmissionEntry | null
}

/**
 * Every submission in the hackathon, keyed by team id. A team with none has no
 * entry.
 *
 * One hackathon-scoped `ListSubmissions`. It comes back ordered by team, then by
 * version ascending, so each team's list keeps the order a team-scoped call
 * would give it.
 *
 * `ListSubmissions` rather than the submissions nested in `team.get`, for the
 * same reason the participant page gives: only this one is meant to be complete.
 * Nothing is caught: an owner holds `submission:read` hackathon-wide
 * (`rbac.go:238`), so a refusal here is a real fault worth surfacing.
 */
export async function submissionsByTeam(
  team: TeamServiceClient,
  hackathonId: string,
): Promise<Map<string, Submission[]>> {
  const { submissions } = await team.listSubmissions({ hackathonId })

  const byTeam = new Map<string, Submission[]>()
  for (const s of submissions) {
    const list = byTeam.get(s.teamId)
    if (list) list.push(s)
    else byTeam.set(s.teamId, [s])
  }

  return byTeam
}

/**
 * Every team as a row of the organiser's overview, sorted the way it is shown:
 * the teams with no entry first, then by name.
 *
 * Missing first because the page is for finding who still owes an entry — the
 * teams that are done are the ones nobody has to do anything about. Ties go by
 * team name, not by activity, so a row does not move every time a team saves.
 *
 * A team holding only drafts has no entry, so it is `missing` — the same as on
 * the ballot and the Submissions page, which all read `submissionEntry`.
 *
 * @param projects project id → project; a team whose project is missing from
 *   it shows "Unknown project" rather than dropping out of the overview.
 * @param memberNames user id → name, for who saved each entry.
 */
export function submissionOverview(
  teams: Team[],
  byTeam: Map<string, Submission[]>,
  projects: Map<string, { title: string; image?: string }>,
  memberNames: Map<string, string>,
): TeamSubmissionRow[] {
  const rank = (s: SubmissionStanding) => SUBMISSION_STANDINGS.indexOf(s)

  return teams
    .map((t) => {
      const entry = submissionEntry(byTeam.get(t.id) ?? [], memberNames)
      const project = projects.get(t.projectId)

      return {
        teamId: t.id,
        teamName: t.name,
        projectTitle: project?.title ?? "Unknown project",
        imageUrl: project?.image,
        members: t.members
          .map((m) => m.displayName || m.username)
          .sort((a, b) => a.localeCompare(b)),
        standing: entry ? ("submitted" as const) : ("missing" as const),
        entry,
      }
    })
    .sort(
      (a, b) =>
        rank(a.standing) - rank(b.standing) ||
        a.teamName.localeCompare(b.teamName),
    )
}
