// Shared behaviour for the management lists (platform pages, users,
// participants, submissions): a quick string search, and remembering whether
// you last looked at them as cards or as a table.

export type ViewMode = "cards" | "table"

/** A table column. `sort` present ⇒ the header is clickable. */
export interface Column<Row> {
  key: string
  label: string
  sort?: (row: Row) => string | number
  align?: "left" | "right" | "center"
  /** e.g. 'hidden md:table-cell' to drop a column on narrow screens. */
  class?: string
}

/** A dropdown filter. `''` is always offered as "all"; list the real values. */
export interface FilterDef {
  id: string
  label: string
  options: { value: string; label: string }[]
}

/**
 * Case-insensitive substring match across the fields a row is searchable by.
 *
 * Every whitespace-separated term must match somewhere, so typing more words
 * NARROWS the result ("alice owner") instead of finding nothing — which is
 * what people expect from a search box and not what a single `includes` does.
 */
export function matchesQuery(
  query: string,
  ...fields: (string | number | null | undefined)[]
): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true

  const haystack = fields
    .filter((f) => f !== null && f !== undefined && f !== "")
    .join(" ")
    .toLowerCase()

  return terms.every((term) => haystack.includes(term))
}

const storageKey = (name: string) => `hackagon:view:${name}`

/**
 * The view mode this browser last used for a list.
 *
 * Guarded for SSR: this runs during hydration too, where `localStorage` does
 * not exist, and a page that throws there renders nothing at all.
 */
export function loadViewMode(name: string, fallback: ViewMode): ViewMode {
  if (typeof localStorage === "undefined") return fallback
  const stored = localStorage.getItem(storageKey(name))

  return stored === "cards" || stored === "table" ? stored : fallback
}

export function saveViewMode(name: string, mode: ViewMode): void {
  if (typeof localStorage === "undefined") return
  localStorage.setItem(storageKey(name), mode)
}
