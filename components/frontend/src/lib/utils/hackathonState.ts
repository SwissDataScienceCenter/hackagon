/**
 * Mismatches between what a phase SAYS and what is actually switched on.
 *
 * Adapted from main's `stateAlerts`, re-expressed against our four-state
 * CapabilityStatus. This is the counterpart to the confusion reported from the
 * walkthrough: a phase names the capabilities it opens, an organiser can also
 * flip those switches by hand, and nothing told them when the two disagreed.
 * They found out when a participant could not do the thing the timeline
 * promised.
 *
 * Raw numbers, because components import this and `$lib/server/**` is
 * server-only. CapabilityState: 1 COMING, 2 OPEN, 3 CLOSED, 4 UNGOVERNED.
 */

const COMING = 1
const CLOSED = 3

export interface CapabilityRow {
  capability: number
  state: number
  /** The phase this capability opens in, when one is linked. */
  openInPhaseId?: string
}

export interface StateAlert {
  capability: number
  /** What is wrong, in the organiser's terms. */
  message: string
}

const LABELS: Partial<Record<number, string>> = {
  1: "Registration",
  2: "Proposing projects",
  3: "Team preferences",
  4: "Submissions",
  5: "Voting",
  6: "Results",
}

/**
 * Capabilities the CURRENT phase says should be open, and are not.
 *
 * Deliberately one-directional. A capability open ahead of its phase is an
 * organiser opening something early, which is a normal thing to do on purpose;
 * a capability the current phase expects and is switched OFF is the case where
 * participants are told to do something they cannot, so only that one is worth
 * interrupting anybody about.
 *
 * Returns an empty list when there is no current phase: with nothing declared,
 * nothing can be inconsistent with it.
 */
export function stateAlerts(
  capabilities: CapabilityRow[] = [],
  currentPhaseId: string | undefined,
): StateAlert[] {
  if (!currentPhaseId) return []

  return capabilities
    .filter(
      (c) =>
        c.openInPhaseId === currentPhaseId &&
        (c.state === CLOSED || c.state === COMING),
    )
    .map((c) => ({
      capability: c.capability,
      message: `${LABELS[c.capability] ?? "A capability"} is scheduled to open in the current phase but is switched off.`,
    }))
}
