export type PhaseStatus = "completed" | "active" | "upcoming" | "current"

/**
 * Where a phase sits relative to now, from its own dates alone.
 *
 * The backend computes `HackathonStatus` server-side but says nothing about
 * individual phases, so this is ours to derive. Never returns `"current"` —
 * that comes from an organizer's declaration, which only `resolvePhaseStatus`
 * knows about.
 *
 * Evaluated at call time, so a page left open across a phase boundary shows a
 * stale status until the next navigation. Same property `hackathon.status` has.
 */
export function phaseStatus(
  startsAt: Date | undefined,
  endsAt: Date | undefined,
): PhaseStatus {
  const now = new Date()
  if (endsAt && endsAt < now) return "completed"
  if (startsAt && startsAt <= now) return "active"
  return "upcoming"
}

/**
 * The label for one phase, given the phase the organizer has declared current.
 *
 * **A declaration wins over the dates.** `HackathonState.current_phase_id` and
 * the phase's own dates are independent — `SetCurrentPhase` writes the pointer
 * and touches nothing else — so the two genuinely can disagree, and a hackathon
 * whose phases have all ended can still declare one current. When that happens
 * the organizer's answer is the one a participant should read.
 *
 * So when a declaration exists, **no other phase may claim nowness**: the
 * declared one is `"current"` and every other is `"completed"` if it has ended,
 * `"upcoming"` otherwise. That deliberately shows a phase whose dates are running
 * as `"upcoming"` if the organizer has declared a different one current — one
 * timeline, one answer to "where are we", rather than two phases both looking
 * live.
 *
 * With no declaration this is exactly `phaseStatus`, which is how every hackathon
 * behaved before current phases existed.
 */
export function resolvePhaseStatus(
  phase: { id: string; startsAt?: Date | undefined; endsAt?: Date | undefined },
  currentPhaseId: string | undefined,
): PhaseStatus {
  if (!currentPhaseId) return phaseStatus(phase.startsAt, phase.endsAt)
  if (phase.id === currentPhaseId) return "current"

  return phase.endsAt && phase.endsAt < new Date() ? "completed" : "upcoming"
}

/**
 * Phases in chronological order. `hackathon.get` returns them in whatever order
 * the DB hands back, and both the header bar and the timeline page need the same
 * sequence, so neither sorts on its own.
 *
 * A phase with no `startsAt` sorts first — `startsAt` is optional in the schema,
 * and leading with the undated one beats scattering it mid-sequence.
 */
export function sortPhasesByStart<T extends { startsAt?: Date | undefined }>(
  phases: readonly T[],
): T[] {
  return [...phases].sort(
    (a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0),
  )
}

/**
 * The six capabilities a phase can be tagged with — Capability: REGISTER=1,
 * PROPOSE_PROJECTS=2, SET_TEAM_PREFERENCES=3, CREATE_PROJECT_SUBMISSIONS=4,
 * VOTE=5, VIEW_RESULTS=6.
 *
 * Raw numbers, like the other status helpers here, so the form component can
 * render the checkboxes without importing the generated `Capability` enum — it
 * lives under `$lib/server/grpc`, which a `.svelte` file may not touch. Proto
 * enum numbers are contract-stable, and the server still validates what comes
 * back (`defined_only`).
 *
 * **A phase label describes the schedule; the schedule is also applied.** On this
 * branch a capability names the phase it opens in (`open_in_phase_id`), and
 * `AdvancePhase` switches exactly those on — closing the ones whose closing phase
 * has passed — in the transaction that moves the pointer. Capabilities with no
 * phase linked change only when someone sets them. (This said the opposite until
 * now, inherited from a design where phases really were inert.) Settled deliberately; see
 * `mydocs/docs/backend-tickets/project-preferences-capability.md`.
 */
const CAPABILITY_LABEL: Partial<Record<number, string>> = {
  1: "Register",
  2: "Propose projects",
  3: "Set team preferences",
  4: "Submit project work",
  5: "Vote",
  6: "View results",
}

/** The six in enum order, for rendering a checkbox per capability. */
export const PHASE_CAPABILITIES: { value: number; label: string }[] = [
  1, 2, 3, 4, 5, 6,
].map((value) => ({ value, label: CAPABILITY_LABEL[value] as string }))

/** Human label for one capability, or undefined if the value is unknown. */
export const capabilityLabel = (c: number): string | undefined =>
  CAPABILITY_LABEL[c]

/**
 * Capabilities a phase says belong to it that are not actually switched on.
 *
 * This is the cost of keeping the two mechanisms separate, made visible.
 * Advancing to a phase tagged `vote` does **not** enable voting — nothing does
 * but `SetCapabilities` — so an organizer can sit in a phase whose whole point
 * is refused for everyone. Rather than have the phase silently enable things,
 * the UI names the gap and lets the organizer decide.
 *
 * Returns capability numbers, in the phase's own tag order. Unknown tag values
 * are dropped: they cannot be enabled, so reporting them as missing would be
 * noise.
 */
export function unmetPhaseCapabilities(
  phaseCapabilities: readonly number[],
  enabled: readonly number[],
): number[] {
  const on = new Set(enabled)

  return phaseCapabilities.filter(
    (c) => CAPABILITY_LABEL[c] !== undefined && !on.has(c),
  )
}

/**
 * Capabilities that are switched on but are not part of this phase's plan.
 *
 * The other half of the picture from `unmetPhaseCapabilities`: that one says what
 * the phase wants and lacks, this one what participants can do beyond it. Extras
 * are **not** a problem — registration is tagged on no phase yet legitimately
 * stays open across several — so this is shown as information, never as a warning.
 *
 * Sorted, so the order does not wander with whatever order the state arrived in.
 */
export function extraEnabledCapabilities(
  phaseCapabilities: readonly number[],
  enabled: readonly number[],
): number[] {
  const planned = new Set(phaseCapabilities)

  return enabled
    .filter((c) => CAPABILITY_LABEL[c] !== undefined && !planned.has(c))
    .sort((a, b) => a - b)
}

/**
 * What should be enabled after "enable what this phase expects".
 *
 * **Strictly additive: it never switches anything off.** An exact match to the
 * phase's tags would be destructive — Registration is tagged on no phase, so
 * "apply the Hacking phase" would close sign-ups as a side effect. Turning a
 * capability off stays a deliberate act on the switches.
 *
 * Unknown tag values are dropped rather than passed through: `SetCapabilities`
 * refuses anything outside the enum, so sending one would fail the whole call.
 * Result is sorted so it is stable to assert on.
 */
export function withPhaseCapabilitiesEnabled(
  enabled: readonly number[],
  phaseCapabilities: readonly number[],
): number[] {
  const known = phaseCapabilities.filter(
    (c) => CAPABILITY_LABEL[c] !== undefined,
  )

  return [...new Set([...enabled, ...known])].sort((a, b) => a - b)
}

/**
 * A `Date` as `datetime-local` wants it: `YYYY-MM-DDTHH:mm`, in the viewer's
 * own timezone.
 *
 * `toISOString()` would be UTC and would show an organizer a start time they did
 * not enter. Built from the local getters instead, which is what the input then
 * reads back as local when it is submitted.
 */
export function toDateTimeLocal(d: Date | undefined): string {
  if (!d) return ""
  const pad = (n: number) => String(n).padStart(2, "0")

  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}
