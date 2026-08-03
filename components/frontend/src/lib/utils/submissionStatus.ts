import { lockReason, type CapabilityInfo } from "./capabilities"

// SubmissionStatus numeric values: UNSPECIFIED=0, DRAFT=1, FINAL=2
const LABEL: Partial<Record<number, string>> = {
  1: "Draft",
  2: "Final",
}
const BADGE_PRESET: Partial<Record<number, string>> = {
  1: "preset-tonal-warning",
  2: "preset-tonal-success",
}

export function submissionStatusLabel(s: number): string | undefined {
  return LABEL[s]
}

export function submissionStatusBadgePreset(s: number): string | undefined {
  return BADGE_PRESET[s]
}

export const SUBMISSION_DRAFT = 1
export const SUBMISSION_FINAL = 2

export interface SubmissionSummary {
  /** e.g. "Draft saved", "Submitted", "Submissions open Aug 23". */
  label: string
  /** The deadline, when there still is one to meet. */
  detail?: string
  tone: "success" | "warning" | "muted"
}

function formatDay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/**
 * Where a team stands on submitting, read as the combination of what they have
 * saved and whether the window is open.
 *
 * Neither half is enough alone: "Draft" is reassuring while submissions are open
 * and alarming once they have closed, and "nothing saved" means "get started" in
 * one phase and "you missed it" in the next.
 *
 * `ungoverned` deliberately reads the same as `open` minus the urgency. The
 * server has no opinion on a hackathon predating the capability, so the honest
 * report is what the team has saved, with nothing implied about a deadline.
 */
export function submissionSummary(
  status: number | undefined,
  info: CapabilityInfo,
  now: Date = new Date(),
): SubmissionSummary {
  // Checked before the window, and unconditionally: a finalized submission is
  // finalized whether or not the phase that accepted it has since closed.
  if (status === SUBMISSION_FINAL) {
    return { label: "Submitted", tone: "success" }
  }

  if (info.state === "coming") {
    // lockReason already phrases this one ("Submissions open Aug 23"), and
    // reusing it is what keeps the card agreeing with the nav and the CTA.
    return {
      label: lockReason("submit_project", info) ?? "Not open yet",
      tone: "muted",
    }
  }

  if (info.state === "closed") {
    return { label: "Not submitted", tone: "muted" }
  }

  return {
    label: status === SUBMISSION_DRAFT ? "Draft saved" : "Not started",
    // Skipped once elapsed: the server's state is the truth, and a stale phase
    // date must not produce a deadline that has already gone by.
    detail:
      info.closesAt && info.closesAt > now
        ? `due ${formatDay(info.closesAt)}`
        : undefined,
    tone: info.state === "open" ? "warning" : "muted",
  }
}
