/**
 * Everything the UI has to say about a capability, one row per capability.
 *
 * Ported from main's `refactor(frontend): hold each capability's label and
 * sentence in one table` — the reasoning there was that two maps keyed by the
 * same six enum numbers could disagree, so a capability could end up with a
 * label and no sentence beside its switch.
 *
 * This branch had it worse. THREE maps keyed by those numbers lived in three
 * files, and two of them exported a function called `capabilityLabel` with
 * different strings behind it: `$lib/utils/phase` said "Submit project work",
 * `$lib/utils/capabilityLinks` said "Turn work in", and
 * `$lib/utils/hackathonState` said "Submissions" — none of them wrong, all of
 * them the same capability, and nothing keeping the six keys in step. Sibling
 * components imported the two same-named functions and got different words.
 *
 * They are different grammatical cases, not accidental duplicates, so this
 * keeps all of them — as FIELDS OF ONE ROW rather than as parallel maps:
 *
 *   label       the switch on the organiser's panel        "Submit project work"
 *   description what that switch permits, one sentence     "Hand in work against …"
 *   action      the thing a participant goes and does      "Turn work in"
 *   subject     the same capability as a sentence subject  "Submissions"
 *
 * Third person throughout, because capabilities grant to the `Member` role and
 * casbin has no inheritance — an owner reading "you can" is being lied to.
 *
 * An array rather than the `Partial<Record<number, string>>` the frontend
 * convention asks for: the convention exists so an unrecognised enum value
 * types as `undefined` rather than `string`, and `.find()` returns
 * `CapabilityEntry | undefined`, which gives the same guarantee for four
 * strings at once. It also removed the `as string` cast the partial map needed.
 *
 * Raw numbers, never the generated `Capability` enum: components import this
 * and `$lib/server/**` is server-only. Proto enum numbers are contract-stable
 * and the server still validates what comes back (`defined_only`).
 */

/**
 * `CapabilityState`, as the proto numbers it.
 *
 * **Four states, and this branch keeps all four.** `origin/main` deleted the
 * `Capability` entity and replaced it with flat `HackathonState` booleans
 * enforced through casbin policy; here `HackathonState` is a projection with no
 * enforcement behind it, because two gates that can disagree are worse than
 * either alone. So every capability surface has to answer with one of these
 * four, and anything that reduces them to on/off is losing the answer:
 * UNGOVERNED and CLOSED both look "off" and mean opposite things.
 */
export const CapabilityState = {
  /** Closed now, opens later — the client can count down to it. */
  COMING: 1,
  OPEN: 2,
  CLOSED: 3,
  /** No stored row, so the server has no opinion and permits the action. */
  UNGOVERNED: 4,
} as const

export interface CapabilityEntry {
  value: number
  label: string
  description: string
  action: string
  subject: string
  /** The page that exercises it, or undefined when there is none. */
  path?: (hackathonId: string) => string
}

/**
 * The six, in the order the switches render.
 *
 * Registration first because it gates getting in at all, results last because
 * they only matter once everything else is over. Stating the order here is what
 * `PHASE_CAPABILITIES` reads, so enum order is written down once rather than as
 * a second literal listing 1 through 6.
 */
const CAPABILITIES: CapabilityEntry[] = [
  {
    value: 1,
    label: "Register",
    description: "Join this hackathon from the dashboard.",
    action: "Register",
    subject: "Registration",
    // Deliberately no page: by the time a member reads their own state card
    // they have already registered, so a link to the join flow goes backwards.
    path: undefined,
  },
  {
    value: 2,
    label: "Propose projects",
    description: "Propose a project for the organisers to review.",
    action: "Propose a project",
    subject: "Proposing projects",
    path: (id) => `/my/hackathon/${id}/projects/proposals/propose`,
  },
  {
    value: 3,
    label: "Set team preferences",
    description: "Say which projects they would like to work on.",
    action: "Set team preferences",
    subject: "Team preferences",
    path: (id) => `/my/hackathon/${id}/projects`,
  },
  {
    value: 4,
    label: "Submit project work",
    description: "Hand in work against their team's project.",
    action: "Turn work in",
    subject: "Submissions",
    path: (id) => `/my/hackathon/${id}/submissions`,
  },
  {
    value: 5,
    label: "Vote",
    description: "Cast a vote in the categories that are open.",
    action: "Vote",
    subject: "Voting",
    path: (id) => `/my/hackathon/${id}/voting`,
  },
  {
    value: 6,
    // Not main's "See the results that have been published": on this branch the
    // flag IS the publish switch (`capability.proto` says so), because results
    // are entered one placement at a time and must not leak partial standings.
    // Main's sentence describes a switch that reveals something already
    // published, which is a different mechanism.
    label: "View results",
    description: "See the results. Switching this on is what publishes them.",
    action: "See the results",
    subject: "Results",
    // Ours folds results into the voting page; main sends them to `/results`.
    path: (id) => `/my/hackathon/${id}/voting`,
  },
]

/** The row for one capability, or undefined if this build does not know it. */
export const capabilityEntry = (c: number): CapabilityEntry | undefined =>
  CAPABILITIES.find((x) => x.value === c)

/** A value the enum has. Anything else can be neither labelled nor granted. */
export const isKnownCapability = (c: number): boolean =>
  CAPABILITIES.some((x) => x.value === c)

/** Human label for one capability, or undefined if the value is unknown. */
export const capabilityLabel = (c: number): string | undefined =>
  capabilityEntry(c)?.label

/** One line on what a capability permits, or undefined for an unknown value. */
export const capabilityDescription = (c: number): string | undefined =>
  capabilityEntry(c)?.description

/** The capability as something a participant does: "Turn work in". */
export const capabilityAction = (c: number): string | undefined =>
  capabilityEntry(c)?.action

/** The capability as a sentence subject: "Submissions are …". */
export const capabilitySubject = (c: number): string | undefined =>
  capabilityEntry(c)?.subject

/** Where a capability is exercised, or undefined when there is no such page. */
export const capabilityHref = (
  hackathonId: string,
  c: number,
): string | undefined => capabilityEntry(c)?.path?.(hackathonId)

/** The six in enum order, for rendering a control per capability. */
export const CAPABILITY_VALUES: number[] = CAPABILITIES.map((c) => c.value)

/**
 * Rows in the table's order, with anything this build cannot name dropped.
 *
 * The server sends one status per capability it knows about, so a frontend
 * running against a newer backend can receive a seventh. Rendering an unnamed
 * switch would be worse than leaving it out: nobody can tell what they are
 * turning on.
 */
export function knownCapabilityRows<T extends { capability: number }>(
  rows: readonly T[],
): T[] {
  const order = new Map(CAPABILITY_VALUES.map((v, i) => [v, i]))

  return rows
    .filter((r) => order.has(r.capability))
    .sort(
      (a, b) => (order.get(a.capability) ?? 0) - (order.get(b.capability) ?? 0),
    )
}

/**
 * What each state is called, and what it means for the people it binds.
 *
 * The reason this exists as its own table: on the organiser's panel three of
 * the four states used to render as the same unticked box, so "opens on
 * Friday", "switched off" and "nothing governs this, so they can already do it"
 * were one pixel-identical answer. The middle one is a plan and the last one is
 * a permission the organiser did not know they had granted.
 */
const CAPABILITY_STATES: {
  value: number
  label: string
  note: string
}[] = [
  {
    value: CapabilityState.COMING,
    label: "Opens later",
    note: "Scheduled. It switches on by itself when the timeline reaches its phase.",
  },
  {
    value: CapabilityState.OPEN,
    label: "Open",
    note: "Participants can do this now.",
  },
  {
    value: CapabilityState.CLOSED,
    label: "Closed",
    note: "Participants cannot do this, and nothing will change that on its own.",
  },
  {
    value: CapabilityState.UNGOVERNED,
    label: "Not governed",
    note: "No stored setting, so the server allows it. Saving here is refused until the row exists.",
  },
]

/**
 * The state as a short badge.
 *
 * `opensAt` turns COMING into a date, which is the whole reason COMING is a
 * state of its own rather than a flavour of closed. It is absent when the
 * organiser has advanced by hand past a phase with no dates, and then "Opens
 * later" is all anyone honestly knows.
 */
export function capabilityStateLabel(
  state: number,
  opensAt?: Date,
): string | undefined {
  const entry = CAPABILITY_STATES.find((s) => s.value === state)
  if (!entry) return undefined
  if (state === CapabilityState.COMING && opensAt) {
    return `Opens ${new Date(opensAt).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    })}`
  }

  return entry.label
}

/** The sentence under the badge, or undefined for a state we cannot name. */
export const capabilityStateNote = (state: number): string | undefined =>
  CAPABILITY_STATES.find((s) => s.value === state)?.note

/**
 * Whether the state permits the action.
 *
 * UNGOVERNED counts as permitted, matching `capability.State.Allowed` on the
 * server: no row governs it, so the mutation proceeds. A client that compared
 * against OPEN alone would tell people they cannot do something the server will
 * happily let them do.
 */
export const capabilityAllows = (state: number): boolean =>
  state === CapabilityState.OPEN || state === CapabilityState.UNGOVERNED

/**
 * Whether the stored flag is on.
 *
 * Distinct from `capabilityAllows` on purpose, and the distinction is the whole
 * of UNGOVERNED: this is what a checkbox bound to `enabled` reflects, that is
 * what a participant may do.
 */
export const capabilityIsOn = (state: number): boolean =>
  state === CapabilityState.OPEN

/** COMING is "not yet", CLOSED is "no longer" — worth saying differently. */
export const capabilityIsComing = (state: number): boolean =>
  state === CapabilityState.COMING

/** No stored row: the server permits it and cannot be told otherwise here. */
export const capabilityIsUngoverned = (state: number): boolean =>
  state === CapabilityState.UNGOVERNED
