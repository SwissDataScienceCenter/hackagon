import type { Submission } from "$lib/server/grpc/generated/hackathon/entities/submission"
import { SubmissionStatus } from "$lib/server/grpc/generated/hackathon/entities/submission_status"

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
