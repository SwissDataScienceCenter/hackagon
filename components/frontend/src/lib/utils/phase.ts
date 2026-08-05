export type PhaseStatus = "completed" | "active" | "upcoming"

/**
 * Where a phase sits relative to now. Resolved from the phase's own dates —
 * the backend computes `HackathonStatus` server-side but says nothing about
 * individual phases, so this is ours to derive.
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
 * **These are labels, not switches.** `Phase.capabilities` is informational —
 * `db/schema/phase.go:47` says so outright, and advancing to a phase grants
 * nobody anything. What a participant may actually do comes from
 * `HackathonState` plus its casbin rows, which only
 * `HackathonService.SetCapabilities` writes. Settled deliberately; see
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
