// What is wrong with a hackathon's configuration right now, as one decision
// shared by every surface that reports it.
//
// Client-safe — raw capability numbers, no generated types — so the layout
// banner and the sidebar badge can both import it. Reading the capabilities off
// the proto stays server-only, in `$lib/server/hackathon/phaseForm`.

/**
 * A configuration problem worth interrupting an organizer about.
 *
 * One kind, and the bar is deliberately that high: a *data* problem the
 * organizer did not choose and cannot express through any switch. Three
 * conditions were considered and are reported elsewhere instead, because a
 * banner nobody can clear becomes wallpaper and stops being read at all:
 *
 *  - **the current phase plans a capability that is switched off.** Not a fault
 *    at all: `Phase.capabilities` is informational, and what participants may do
 *    is the organizer's decision, taken switch by switch. A hackathon that runs
 *    without project proposals is configured, not broken. `CapabilitiesPanel` on
 *    Manage Hackathon still reports the mismatch, beside the switches that would
 *    change it, and Manage Timeline reports it on the phase rows.
 *  - **no phase declared current** while the hackathon is running. The timeline
 *    still works; nobody is blocked.
 *  - **the current phase's `endsAt` has passed.** Stale rather than broken, and
 *    it is the steady state of every seeded hackathon, so it would be on
 *    permanently in development.
 */
export type StateAlert = { kind: "no-state" }

/**
 * The problems to report, worst first.
 *
 * Yields at most one today, and the array is still the right shape: the
 * conditions above are deferred rather than rejected, and a caller written
 * against a single value would have to change the day any of them lands.
 */
export function stateAlerts(input: { hasState: boolean }): StateAlert[] {
  if (!input.hasState) return [{ kind: "no-state" }]

  return []
}
