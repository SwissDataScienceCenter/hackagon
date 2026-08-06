// What is wrong with a hackathon's configuration right now, as one decision
// shared by every surface that reports it.
//
// Client-safe — raw capability numbers, no generated types — so the layout
// banner and the sidebar badge can both import it. Reading the capabilities off
// the proto stays server-only, in `$lib/server/hackathon/phaseForm`.

/**
 * A configuration problem worth interrupting an organizer about.
 *
 * Deliberately only the two that leave participants unable to act. Two further
 * conditions were considered and left out of this list on purpose, because a
 * banner nobody can clear becomes wallpaper and stops being read at all:
 *
 *  - **no phase declared current** while the hackathon is running. The timeline
 *    still works; nobody is blocked.
 *  - **the current phase's `endsAt` has passed.** Stale rather than broken, and
 *    it is the steady state of every seeded hackathon, so it would be on
 *    permanently in development.
 *
 * Both are surfaced quietly on the overview's state card instead, where an
 * organizer reads them without being interrupted by them.
 */
export type StateAlert =
  | { kind: "no-state" }
  | { kind: "unmet"; phaseName: string; capabilities: number[] }

/**
 * The problems to report, worst first.
 *
 * Yields at most one today, and the array is still the right shape: the two
 * conditions above are deferred rather than rejected, and a caller written
 * against a single value would have to change the day either lands.
 *
 * A hackathon with no `HackathonState` row reports **only** that. Without the
 * row nothing is enabled, so every capability any phase plans for is also unmet
 * — listing them would bury the one fact that explains all of them.
 */
export function stateAlerts(input: {
  hasState: boolean
  /** Empty when no phase is current; `unmet` is then empty too. */
  currentPhaseName: string
  /** From `unmetPhaseCapabilities` — the current phase's plans that are off. */
  unmet: readonly number[]
}): StateAlert[] {
  if (!input.hasState) return [{ kind: "no-state" }]

  if (input.unmet.length > 0) {
    return [
      {
        kind: "unmet",
        phaseName: input.currentPhaseName,
        capabilities: [...input.unmet],
      },
    ]
  }

  return []
}
