import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"

/**
 * What Settings says beside its voting-related switches.
 *
 * One rule above all: **Settings is never blocked.** Every switch can always be
 * turned off, and only one can be refused when turned on — "View results",
 * until the results are final — with two ways it can never get stuck: nobody
 * having voted (nothing to publish too early) and the check failing (the
 * switch then warns instead of locking). Everything else is a warning, never a
 * lock: an organizer may do it, and is told what it means.
 *
 * `round` is undefined when the voting state could not be read.
 */
export type VotingRound = { final: boolean; anyVotes: boolean } | undefined

export interface SwitchNote {
  /** Why this switch cannot be turned on now. Only ever set while it is off. */
  lockedReason?: string
  /** What turning it on, or leaving it on, means. Never stops anything. */
  warnings: string[]
}

const VOTE = Capability.CAPABILITY_VOTE as number
const VIEW_RESULTS = Capability.CAPABILITY_VIEW_RESULTS as number
const SUBMIT = Capability.CAPABILITY_CREATE_PROJECT_SUBMISSIONS as number

/** Whether "View results" may be turned on — the one switch that can refuse. */
export function mayPublishResults(round: VotingRound): boolean {
  return round === undefined || !round.anyVotes || round.final
}

export function switchNote(
  capability: number,
  enabled: number[],
  round: VotingRound,
): SwitchNote {
  const on = (c: number) => enabled.includes(c)
  const note: SwitchNote = { warnings: [] }

  if (capability === VIEW_RESULTS && !on(VIEW_RESULTS)) {
    if (!mayPublishResults(round)) {
      note.lockedReason = "Make the results final in Manage Voting first."
    } else if (round === undefined) {
      note.warnings.push(
        "Couldn't check whether the results are final — reload to try again.",
      )
    }
  }

  if (capability === VOTE && round?.final) {
    note.warnings.push(
      "The results are already final — votes cast now won't count.",
    )
  }

  if (
    (capability === VOTE || capability === SUBMIT) &&
    on(VOTE) &&
    on(SUBMIT)
  ) {
    note.warnings.push(
      "Teams can still change their entries while voting is open.",
    )
  }

  return note
}
