// HackathonStatus numeric values: PENDING=1, ACTIVE=2, FINISHED=3
const LABEL: Record<number, string> = { 1: 'Upcoming', 2: 'Active', 3: 'Finished' };
const BADGE_PRESET: Record<number, string> = {
    1: 'preset-tonal-warning',
    2: 'preset-tonal-primary',
    3: 'preset-outlined-surface-200-800',
};

export function statusLabel(s: number): string | undefined {
    return LABEL[s];
}

export function statusBadgePreset(s: number): string | undefined {
    return BADGE_PRESET[s];
}
