// Which slice of the project queue an organiser is looking at.
//
// A filter, not a set of pages: every status shares the same card and the same
// detail route, so this is one list narrowed rather than three surfaces. That is
// what makes it a query parameter on `projects/manage` instead of a route each,
// unlike the participants/waitlist split — there the two halves have different
// actions and genuinely are different pages.
//
// **All three get a tab, and the landing view is always Approved.** An earlier
// pass hid the approved tab and opened on the queue whenever anything was
// waiting in it; the effect was that a single unreviewed proposal made the
// hackathon's whole line-up look like it had vanished. The count on the
// Awaiting review tab is what asks for attention now — it can do that without
// deciding where someone arrives.
//
// Deliberately words rather than the numeric `ProjectStatus` values: this
// vocabulary appears in the address bar, where `?status=proposed` says what it
// means and `?status=1` does not. Mapping the words to statuses stays in the
// load, which already imports the generated enum; nothing here does, so a
// component may import this file (`$lib/server/` may not be imported by one).

/** Every slice, in the order the tabs show them. */
export const PROJECT_FILTERS = ["approved", "proposed", "rejected"] as const

export type ProjectFilter = (typeof PROJECT_FILTERS)[number]

/**
 * Where an address that names no slice lands.
 *
 * The hackathon's actual line-up, unconditionally — not whichever tab happens to
 * have rows in it. A default that moved with the data meant the page showed
 * something different each visit, and the same URL shown to two people could
 * disagree.
 */
export const DEFAULT_PROJECT_FILTER: ProjectFilter = "approved"

/** Labels. "Awaiting review" rather than "Proposed" — it names the work. */
export const PROJECT_FILTER_LABEL: Record<ProjectFilter, string> = {
  approved: "Approved",
  proposed: "Awaiting review",
  rejected: "Rejected",
}

/**
 * The slice a query parameter asks for, or `undefined` when it asks for nothing
 * recognizable — an absent parameter, but also a typo or a stale link, which
 * should land somewhere sensible rather than 400.
 *
 * Parsing only. What `undefined` becomes is `DEFAULT_PROJECT_FILTER`, applied by
 * the caller, so a page that wants to keep "nothing was asked for" distinct from
 * "approved was asked for" still can — the detail route does, to decide whether
 * it has a view worth carrying back.
 */
export function projectFilterFrom(
  raw: string | null | undefined,
): ProjectFilter | undefined {
  return PROJECT_FILTERS.includes(raw as ProjectFilter)
    ? (raw as ProjectFilter)
    : undefined
}

/**
 * The query string that reproduces a slice, leading `?` included.
 *
 * Explicit for all three, `approved` included, so every tab's address has the
 * same shape and a decision can carry the organiser back to the exact view they
 * were on.
 */
export function projectFilterQuery(filter: ProjectFilter): string {
  return `?status=${filter}`
}
