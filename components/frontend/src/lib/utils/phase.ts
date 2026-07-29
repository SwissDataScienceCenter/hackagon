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
