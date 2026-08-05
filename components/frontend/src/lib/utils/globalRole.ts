// GlobalRole numeric values: UNSPECIFIED=0, ADMIN=1, HACKATHON_ORGANIZER=2
//
// See projectStatus.ts for why these are raw numbers, not the generated enum.
const LABEL: Partial<Record<number, string>> = {
  1: "Admin",
  2: "Hackathon Organizer",
}
const BADGE_PRESET: Partial<Record<number, string>> = {
  1: "preset-tonal-primary",
  2: "preset-tonal-surface",
}

// Every assignable role, in display order — drives both the badge list and
// the "grant a role the user doesn't hold yet" picker.
export const ASSIGNABLE_GLOBAL_ROLES = [1, 2]

export function globalRoleLabel(r: number): string | undefined {
  return LABEL[r]
}

export function globalRoleBadgePreset(r: number): string | undefined {
  return BADGE_PRESET[r]
}
