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
 * One phase's dates as a line of prose.
 *
 * Shared by the participant timeline, the manage timeline and the overview's
 * state card, which is what stops a third copy appearing: all three had the same
 * function inline before the card needed a fourth.
 *
 * Both dates are optional in the schema, and the CEL rule only forbids one
 * *without* the other on write — rows predating it can still carry either alone,
 * so all four combinations are handled.
 */
export function formatPhaseRange(
  startsAt: Date | undefined,
  endsAt: Date | undefined,
): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  if (!startsAt && !endsAt) return "No dates set"
  if (!startsAt) return `Until ${fmt(endsAt as Date)}`
  if (!endsAt) return `From ${fmt(startsAt)}`

  return `${fmt(startsAt)} – ${fmt(endsAt)}`
}

/**
 * Where the hackathon is now and what comes after it.
 *
 * `declared` is the difference between the two ways "now" can be decided, and
 * the card renders it differently: an organizer's `SetCurrentPhase` pointer, or
 * — with no pointer set — whichever phase's own dates are running. Same
 * precedence `resolvePhaseStatus` applies, so the state card and the timeline
 * can never name different phases as the live one.
 *
 * `next` is the phase after `current` in date order, whether or not its dates
 * have started: with a declaration in play a later phase can already be running
 * by the clock, and calling it "next" is still what an organizer means. With no
 * current phase at all the first phase that has not ended is the next one.
 *
 * A `currentPhaseId` naming a phase that is not in the list resolves to no
 * current phase rather than falling back to the dates — the pointer says the
 * organizer has decided, and quietly answering with a different phase would be
 * worse than answering with none.
 */
export function currentAndNextPhase<
  T extends {
    id: string
    startsAt?: Date | undefined
    endsAt?: Date | undefined
  },
>(
  phases: readonly T[],
  currentPhaseId: string | undefined,
): { current?: T; next?: T; declared: boolean } {
  const sorted = sortPhasesByStart(phases)
  const declared = Boolean(currentPhaseId)

  const index = currentPhaseId
    ? sorted.findIndex((p) => p.id === currentPhaseId)
    : sorted.findIndex((p) => phaseStatus(p.startsAt, p.endsAt) === "active")

  if (index === -1) {
    return {
      current: undefined,
      next: sorted.find(
        (p) => phaseStatus(p.startsAt, p.endsAt) !== "completed",
      ),
      declared,
    }
  }

  return { current: sorted[index], next: sorted[index + 1], declared }
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

/**
 * What switching one on lets a participant do.
 *
 * The labels above scan but say nothing about consequence — "Set team
 * preferences" reads as a setting rather than as a permission handed to everyone
 * in the hackathon. Third person throughout: capabilities grant to the `Member`
 * role, and casbin has no inheritance, so an owner reading "you can" is lied to.
 */
const CAPABILITY_DESCRIPTION: Partial<Record<number, string>> = {
  1: "Join this hackathon from the dashboard.",
  2: "Propose a project for the organizers to review.",
  3: "Say which projects they would like to work on.",
  4: "Hand in work against their team's project.",
  5: "Cast a vote in the categories that are open.",
  6: "See the results that have been published.",
}

/** The six in enum order, for rendering a checkbox per capability. */
export const PHASE_CAPABILITIES: { value: number; label: string }[] = [
  1, 2, 3, 4, 5, 6,
].map((value) => ({ value, label: CAPABILITY_LABEL[value] as string }))

/** Human label for one capability, or undefined if the value is unknown. */
export const capabilityLabel = (c: number): string | undefined =>
  CAPABILITY_LABEL[c]

/** One line on what a capability permits, or undefined for an unknown value. */
export const capabilityDescription = (c: number): string | undefined =>
  CAPABILITY_DESCRIPTION[c]

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
