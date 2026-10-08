/**
 * The shape of a team on the assignment page, shared by the page's workspace
 * and the spreadsheet import that edits it.
 */

export type PlannedTeam = {
  /** Stable key for rendering; equals `id` for a team that already exists. */
  key: string
  /** `null` for a team added on the page that still has to be created. */
  id: string | null
  projectId: string
  name: string
  memberIds: string[]
}

/** "AutoML Pipeline Builder" -> "APB". Mirrors the server's team naming. */
export function initialsOf(text: string): string {
  return (
    text
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  )
}
