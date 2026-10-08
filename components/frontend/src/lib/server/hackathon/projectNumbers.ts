import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"

/**
 * Server-only: reads generated types, so it must never be imported by a
 * component.
 */

/**
 * The approved projects, each with the number the team-assignment page shows.
 *
 * One definition for the page and its spreadsheet, because the spreadsheet
 * carries these numbers in `project` and `prefers` and an upload reads them
 * back: a number the download wrote has to name the same project the page
 * shows under it. Numbered in the order `ExportPreferences` returns them —
 * which is also why rejecting or approving a project shifts the numbers after
 * it, and why the download writes each title beside its number.
 */
export function numberedProjects<
  T extends { id: string; status: ProjectStatus },
>(projects: readonly T[]): (T & { number: number })[] {
  return projects
    .filter((p) => p.status === ProjectStatus.PROJECT_STATUS_APPROVED)
    .map((p, i) => ({ ...p, number: i + 1 }))
}
