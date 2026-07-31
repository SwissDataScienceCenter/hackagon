export type PhaseState = "completed" | "active" | "upcoming"

export function phaseStatus(
  startsAt: Date | undefined,
  endsAt: Date | undefined,
): PhaseState {
  const now = new Date()
  if (endsAt && endsAt < now) return "completed"
  if (startsAt && startsAt <= now) return "active"
  return "upcoming"
}

const LABEL: Record<PhaseState, string> = {
  completed: "Completed",
  active: "Active",
  upcoming: "Upcoming",
}

const BADGE_PRESET: Record<PhaseState, string> = {
  completed: "preset-tonal-primary",
  active: "preset-filled-primary-500",
  upcoming: "preset-tonal-surface",
}

export function phaseStateLabel(s: PhaseState): string {
  return LABEL[s]
}

export function phaseStateBadgePreset(s: PhaseState): string {
  return BADGE_PRESET[s]
}

export interface PhaseWindow {
  startsAt?: Date
  endsAt?: Date
}

export interface CurrentPhase<T> {
  phase: T
  /** True when `phase` is running now, false when it is only the next one up. */
  active: boolean
}

/**
 * The single phase to treat as "where the hackathon is right now".
 *
 * Phases may overlap, so `phaseStatus` can call several of them active at once.
 * Here the latest-started of those wins — it is the one the event most recently
 * moved into. When nothing is running (before the first phase, in a gap between
 * two, or after the last) the soonest upcoming phase stands in with
 * `active: false`, so callers can render "Starts 3 Aug" rather than "Now".
 *
 * Undated phases are skipped: with no window there is nothing to compare
 * against `now`, so a hackathon whose phases are all undated has no current
 * phase and this returns undefined.
 */
export function currentPhase<T extends PhaseWindow>(
  phases: T[],
  now: Date = new Date(),
): CurrentPhase<T> | undefined {
  let running: { phase: T; startsAt: Date } | undefined
  let next: { phase: T; startsAt: Date } | undefined

  for (const phase of phases) {
    const startsAt = phase.startsAt
    if (!startsAt) continue

    if (startsAt > now) {
      if (!next || startsAt < next.startsAt) next = { phase, startsAt }
      continue
    }

    // Started already. Mirror phaseStatus: an open-ended phase stays running.
    if (phase.endsAt && phase.endsAt < now) continue
    if (!running || startsAt > running.startsAt) running = { phase, startsAt }
  }

  if (running) return { phase: running.phase, active: true }
  if (next) return { phase: next.phase, active: false }

  return undefined
}
