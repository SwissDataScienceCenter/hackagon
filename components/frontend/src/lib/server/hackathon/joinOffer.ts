import { CAPABILITY_REGISTER, capabilityAllows } from "$lib/utils/capability"

/** The two facts `HackathonService.List` ships that bear on joining. */
export interface JoinableEntry {
  /** `HackathonStatus`, as a raw enum number. */
  status: number
  capabilities: { capability: number; state: number }[]
}

/** `HackathonStatus.HACKATHON_STATUS_FINISHED`. The literal rather than the
 *  generated import: this module is reached from tests that must not pull
 *  `$lib/server/grpc/generated` into their graph. */
const STATUS_FINISHED = 3

/**
 * Whether to OFFER Join on a dashboard row — never a promise that it will
 * succeed.
 *
 * `List` carries `capabilities` per hackathon precisely "so a list can gate its
 * own buttons instead of firing a mutation to discover it is closed" (its own
 * comment), and the dashboard ignored it: on a populated instance six finished
 * events each rendered a Join button that answered `FailedPrecondition` and
 * could never do anything else.
 *
 * Mirrors `HackathonService.Join`'s first two refusals in its order — finished
 * before capability, because "already finished" is the more useful answer.
 *
 * The third refusal, `requireWindowOpen`, is deliberately NOT mirrored: `List`
 * does not carry the windows, and inventing a second source for them is how a
 * gate starts disagreeing with the handler it copies. A closed window still
 * refuses and the page reports what the backend said. That split is the point —
 * the backend is authoritative, and this only decides what to offer.
 */
export function joinIsOffered(h: JoinableEntry): boolean {
  if (h.status === STATUS_FINISHED) return false

  const register = h.capabilities.find((c) => c.capability === CAPABILITY_REGISTER)
  // Absent means no row governs it, which is UNGOVERNED, which PERMITS — the
  // same answer `capability.State.Allowed` gives on the server. Treating a
  // missing row as "closed" would hide the button on every event that never
  // configured capabilities at all.
  return register === undefined || capabilityAllows(register.state)
}
