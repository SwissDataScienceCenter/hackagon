/**
 * What a member is allowed to do in a hackathon right now, as the backend
 * reports it.
 *
 * The server is authoritative: it resolves every capability from a stored
 * `enabled` flag and enforces it on the matching mutation. This module only
 * translates the wire enums into something components can read and phrase for
 * members — it never decides anything the server did not already decide.
 *
 * Structurally typed on purpose: `$lib/server/**` must never reach a component,
 * so this takes the shape of `CapabilityStatus` rather than importing it.
 */

export type Capability =
  | "register"
  | "submit_proposal"
  | "set_team_preferences"
  | "submit_project"
  | "vote"
  | "view_results"

export const CAPABILITIES: readonly Capability[] = [
  "register",
  "submit_proposal",
  "set_team_preferences",
  "submit_project",
  "vote",
  "view_results",
] as const

/**
 * - `open` — allowed now.
 * - `closed` — a flag is off and there is no future date to wait for.
 * - `coming` — closed now, but a linked phase opens it later, so there is a date
 *   to show. Still blocked; it is a better message, not a weaker gate.
 * - `ungoverned` — no row exists, so the server has no opinion and does not
 *   enforce it. Render exactly as you would have before capabilities existed.
 *   This is what lets a hackathon predating a capability keep working.
 */
export type CapabilityState = "open" | "closed" | "coming" | "ungoverned"

// Wire values from hackathon.entities.Capability / CapabilityState. Kept as
// numbers because that is what the generated client emits; UNSPECIFIED (0) and
// UNRECOGNIZED (-1) deliberately have no mapping.
const CAPABILITY_BY_WIRE: Readonly<Record<number, Capability>> = {
  1: "register",
  2: "submit_proposal",
  3: "set_team_preferences",
  4: "submit_project",
  5: "vote",
  6: "view_results",
}

const STATE_BY_WIRE: Readonly<Record<number, CapabilityState>> = {
  1: "coming",
  2: "open",
  3: "closed",
  4: "ungoverned",
}

/** One entry of `Hackathon.capabilities`, as the generated client shapes it. */
export interface CapabilityStatusRef {
  capability: number
  state: number
  opensAt?: Date
  closesAt?: Date
  opensPhaseId?: string
  closesPhaseId?: string
}

export interface CapabilityInfo {
  state: CapabilityState
  /** When it is expected to open. Absent for manually driven capabilities. */
  opensAt?: Date
  /** When it is expected to close. Absent when nothing schedules the end. */
  closesAt?: Date
  /** Which phase the schedule came from, so a timeline can name it. */
  opensPhaseId?: string
  closesPhaseId?: string
}

export type Capabilities = Record<Capability, CapabilityInfo>

/**
 * Read the wire statuses into a keyed record, filling in anything the server
 * did not mention as `ungoverned`.
 *
 * Missing means ungoverned rather than closed so that an older backend — or a
 * capability added after this hackathon — degrades to "behave as before"
 * instead of hiding the action.
 */
export function readCapabilities(
  statuses: readonly CapabilityStatusRef[] | undefined,
): Capabilities {
  const out = {} as Capabilities
  for (const c of CAPABILITIES) {
    out[c] = { state: "ungoverned" }
  }

  for (const s of statuses ?? []) {
    const capability = CAPABILITY_BY_WIRE[s.capability]
    if (!capability) continue
    out[capability] = {
      state: STATE_BY_WIRE[s.state] ?? "ungoverned",
      opensAt: s.opensAt,
      closesAt: s.closesAt,
      opensPhaseId: s.opensPhaseId,
      closesPhaseId: s.closesPhaseId,
    }
  }

  return out
}

/**
 * Whether the action should work.
 *
 * Note ungoverned counts as available. Call sites must use this rather than
 * comparing against `"open"`, which would disable every capability the server
 * has no row for.
 */
export function isAvailable(state: CapabilityState): boolean {
  return state === "open" || state === "ungoverned"
}

/**
 * Whether to explain the absence. `ungoverned` is excluded on purpose: there is
 * nothing to explain when the server has no opinion.
 *
 * Deliberately not exported — `lockReason` returns undefined when nothing is
 * blocked, which is the one way call sites should ask. A second public predicate
 * only invites the same branch to be written twice.
 */
function isBlocked(state: CapabilityState): boolean {
  return state === "closed" || state === "coming"
}

/**
 * Member-facing phrasing per capability, written out rather than composed, so
 * there is no verb-agreement logic to get wrong ("Registration closes" vs
 * "Proposals close").
 */
const COPY: Readonly<
  Record<Capability, { noun: string; opens: string; closes: string }>
> = {
  register: {
    noun: "Registration",
    opens: "Registration opens",
    closes: "Registration closes",
  },
  submit_proposal: {
    noun: "Proposals",
    opens: "Proposals open",
    closes: "Proposals due",
  },
  set_team_preferences: {
    noun: "Preferences",
    opens: "Preferences open",
    closes: "Preferences due",
  },
  submit_project: {
    noun: "Submissions",
    opens: "Submissions open",
    closes: "Submissions due",
  },
  vote: { noun: "Voting", opens: "Voting opens", closes: "Voting closes" },
  view_results: {
    noun: "Results",
    opens: "Results published",
    closes: "Results close",
  },
}

function formatDay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/** Short member-facing name, e.g. "Proposals". */
export function capabilityNoun(capability: Capability): string {
  return COPY[capability].noun
}

export interface PrimaryAction {
  label: string
  /** Route under `/hackathon/<slug>/`, so the caller resolves the URL. */
  target: string
  /** Absent for the fallback, which is not tied to a capability. */
  capability?: Capability
}

/**
 * The one thing a member is most usefully doing right now, most urgent first.
 *
 * Only capabilities with a real destination appear. `vote` and `view_results`
 * are deliberately absent: they would rank highly, but VoteService is not
 * implemented, so there is nowhere to send anyone. `register` is absent because
 * a viewer inside the member shell has already joined.
 */
const PRIMARY_ACTIONS: readonly Required<PrimaryAction>[] = [
  {
    capability: "submit_project",
    label: "Submit your project",
    target: "submissions",
  },
  {
    capability: "set_team_preferences",
    label: "Set your project preferences",
    target: "proposals",
  },
  {
    capability: "submit_proposal",
    label: "Propose a project",
    target: "proposals/create",
  },
]

/**
 * What to put in front of a member as the next thing to do.
 *
 * Note this tests `state === "open"` where CTA gating uses `isAvailable`, which
 * also accepts `ungoverned`. The asymmetry is deliberate: not knowing whether
 * something is open is a reason to leave a button working, but not a reason to
 * advertise it as the headline action. An entirely ungoverned hackathon
 * therefore falls back to the timeline rather than inventing urgency.
 */
export function primaryAction(capabilities: Capabilities): PrimaryAction {
  for (const candidate of PRIMARY_ACTIONS) {
    if (capabilities[candidate.capability].state === "open") return candidate
  }

  return { label: "View timeline", target: "timeline" }
}

/** What one phase is scheduled to open and to close. */
export interface PhaseCapabilities {
  opens: Capability[]
  closes: Capability[]
}

/**
 * Group capabilities by the phase that schedules them, so a timeline node can
 * say what it unlocks — the thing that makes a phase mean something to a member
 * rather than being a name and a date.
 *
 * Only scheduled capabilities appear. Manually driven ones (voting) belong to no
 * phase by design and are absent from every bucket. Iterated in vocabulary order
 * so the lists are stable rather than dependent on server ordering.
 */
export function capabilitiesByPhase(
  capabilities: Capabilities,
): Map<string, PhaseCapabilities> {
  const byPhase = new Map<string, PhaseCapabilities>()

  const bucket = (phaseId: string): PhaseCapabilities => {
    let existing = byPhase.get(phaseId)
    if (!existing) {
      existing = { opens: [], closes: [] }
      byPhase.set(phaseId, existing)
    }

    return existing
  }

  for (const capability of CAPABILITIES) {
    const info = capabilities[capability]
    if (info.opensPhaseId) bucket(info.opensPhaseId).opens.push(capability)
    if (info.closesPhaseId) bucket(info.closesPhaseId).closes.push(capability)
  }

  return byPhase
}

/**
 * Why a blocked action is unavailable, phrased for a member and suitable as the
 * label of a disabled control — a locked button that says why beats one that
 * just looks broken.
 *
 * Returns undefined when the capability is not blocked, so a caller cannot
 * accidentally render a reason next to a working button.
 */
export function lockReason(
  capability: Capability,
  info: CapabilityInfo,
): string | undefined {
  if (!isBlocked(info.state)) return undefined

  const copy = COPY[capability]
  if (info.state === "coming") {
    // A manually driven capability reaches `coming` only with a date; without
    // one there is nothing honest to promise.
    return info.opensAt
      ? `${copy.opens} ${formatDay(info.opensAt)}`
      : `${copy.noun} not open yet`
  }

  return `${copy.noun} closed`
}

export interface Deadline {
  capability: Capability
  /** e.g. "Proposals due" or "Registration opens". */
  label: string
  at: Date
}

/**
 * The soonest thing that changes — either an open capability closing or a
 * coming one opening.
 *
 * Both directions count because a member cares equally about "submit by
 * Thursday" and "voting opens Friday". Dates already in the past are skipped:
 * the server's state is the truth, and a stale schedule must not produce a
 * countdown that already elapsed.
 */
export function nextDeadline(
  capabilities: Capabilities,
  now: Date = new Date(),
): Deadline | undefined {
  let soonest: Deadline | undefined

  const consider = (candidate: Deadline) => {
    if (candidate.at <= now) return
    if (!soonest || candidate.at < soonest.at) soonest = candidate
  }

  for (const capability of CAPABILITIES) {
    const info = capabilities[capability]
    const copy = COPY[capability]

    if (info.state === "open" && info.closesAt) {
      consider({ capability, label: copy.closes, at: info.closesAt })
    }
    if (info.state === "coming" && info.opensAt) {
      consider({ capability, label: copy.opens, at: info.opensAt })
    }
  }

  return soonest
}

/**
 * A deadline as one phrase, e.g. "Proposals due Aug 21".
 *
 * Same-day deadlines show a time instead of the date: "Submissions due Aug 2" on
 * Aug 2 tells a member nothing, and same-day is exactly when the deadline
 * matters most.
 */
export function deadlineLabel(d: Deadline, now: Date = new Date()): string {
  const when =
    d.at.toDateString() === now.toDateString()
      ? d.at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : formatDay(d.at)

  return `${d.label} ${when}`
}
