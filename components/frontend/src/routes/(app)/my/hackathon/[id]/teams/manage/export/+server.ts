import type { RequestHandler } from "./$types"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { requireGrpc } from "$lib/server/grpc/client"
import { viewerMembership } from "$lib/server/hackathon/membership"
import { listAnswers } from "$lib/server/hackathon/questions"
import {
  answersByParticipant,
  questionRows,
} from "$lib/server/hackathon/registrationForm"
import { csvFilename } from "$lib/utils/csv"
import { assignmentCsv, type AssignmentRow } from "$lib/utils/teamAssignmentCsv"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * The team assignment as a CSV, to be edited in a spreadsheet and uploaded back.
 *
 * A `+server.ts` rather than a load, for the reason the participant roster's
 * export gives: this is a download, not a page. The filename is the hackathon's
 * and so cannot sit in a static route segment, so it rides in
 * `Content-Disposition` and the anchor carries a bare `download`.
 *
 * **The file is the page, in a spreadsheet.** The same population, the same
 * projects, the same context on each person — so what comes back can be applied
 * to what is on screen. Anyone the page does not show is not in it: a
 * participant already on a team belonging to an unapproved project has no row
 * here for the same reason they have no row there, and leaving them out is what
 * stops an upload from putting them on a second team.
 */
export const GET: RequestHandler = async (event) => {
  const { hackathon, team, project } = requireGrpc(event.locals.grpc)

  // Same translation the hackathon layout does: without it a non-member's
  // PermissionDenied from `Get` surfaces as a 500 on a download.
  let h
  try {
    h = (await hackathon.get({ hackathonId: event.params.id })).hackathon
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You are not a confirmed member of this hackathon")
    }
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Hackathon not found")
    }
    throw e
  }
  if (!h) error(404, "Hackathon not found")

  // A `+server.ts` runs no layout loads, so the gate the manage page applies is
  // re-derived here — and it carries real weight, since this file names every
  // participant and what they answered.
  //
  // Through `viewerMembership`, not a plain `members.find`: an organiser who
  // never joined their own hackathon holds ownership on the owners edge and no
  // participant row at all, and finding them by member row alone would refuse
  // the very person the page showed the button to.
  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  const membership = viewerMembership(
    h.members,
    h.owners,
    event.locals.platformUser?.id,
    h.createdAt,
  )
  const isOwner = membership?.role === HackathonRole.HACKATHON_ROLE_OWNER
  if (!isOwner && !isAdmin) {
    error(403, "Only this event's organizers can export the team assignment")
  }

  const [{ teams }, { projects }, questions, answers] = await Promise.all([
    team.list({ hackathonId: event.params.id }),
    project.exportPreferences({ hackathonId: event.params.id }),
    hackathon.listQuestions({ hackathonId: event.params.id }),
    listAnswers(hackathon, event.params.id),
  ])

  const titleById = new Map(projects.map((p) => [p.id, p.title]))
  const approved = new Set(
    projects
      .filter((p) => p.status === ProjectStatus.PROJECT_STATUS_APPROVED)
      .map((p) => p.id),
  )

  // Every preference, including ones naming a project that is not on offer. A
  // title in this column is context for a decision, not a value to copy across
  // — and the import names the project it cannot find, so a misuse is loud.
  const prefersByUser = new Map<string, string[]>()
  for (const p of projects) {
    for (const u of p.preferences) {
      prefersByUser.set(u.id, [...(prefersByUser.get(u.id) ?? []), p.title])
    }
  }

  // A column per question that has a summarisable answer. Free text is left out:
  // a paragraph per cell is what makes a sheet unreadable, and the answer is on
  // the participant's own page. A tick-box reads as Yes or No, which is what a
  // person editing a spreadsheet expects to see in a column.
  const columns = questionRows(questions.questions).filter(
    (q) => q.kind === "enum" || q.kind === "bool",
  )
  const coded = new Set(columns.map((q) => q.key))
  const answersByUser = answersByParticipant(
    questionRows(questions.questions),
    answers,
  )
  const answersFor = (userId: string): Record<string, string> => {
    const filed = answersByUser[userId] ?? []
    const out: Record<string, string> = {}
    for (const a of filed) {
      if (!coded.has(a.key)) continue
      out[a.key] =
        typeof a.value === "boolean" ? (a.value ? "Yes" : "No") : a.value
    }

    return out
  }

  const person = (
    id: string,
    name: string,
    projectTitle: string,
    teamName: string,
  ): AssignmentRow => ({
    userId: id,
    name,
    project: projectTitle,
    team: teamName,
    prefers: prefersByUser.get(id) ?? [],
    answers: answersFor(id),
  })

  // Grouped the way the screen is — by project, then by team — because the file
  // is for reading a team as a block and moving somebody out of it, not for
  // looking one person up. Unassigned last, which is where the pool sits.
  const rows: AssignmentRow[] = []
  const placed = teams
    .filter((t) => approved.has(t.projectId))
    .map((t) => ({ ...t, projectTitle: titleById.get(t.projectId) ?? "" }))
    .sort(
      (a, b) =>
        a.projectTitle.localeCompare(b.projectTitle) ||
        a.name.localeCompare(b.name),
    )
  for (const t of placed) {
    const members = [...t.members].sort((a, b) =>
      (a.displayName || a.username).localeCompare(b.displayName || b.username),
    )
    for (const m of members) {
      rows.push(
        person(m.id, m.displayName || m.username, t.projectTitle, t.name),
      )
    }
  }

  // On a team of any status, so somebody the page cannot show is not offered
  // here as though they were free.
  const assigned = new Set(teams.flatMap((t) => t.members.map((m) => m.id)))
  const pool = h.members
    .filter((m) => !m.isWaiting && m.user && !assigned.has(m.user.id))
    .map((m) => ({
      id: m.user!.id,
      name: m.user!.displayName || m.user!.username,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  for (const p of pool) rows.push(person(p.id, p.name, "", ""))

  return new Response(
    assignmentCsv(
      rows,
      columns.map((q) => ({ key: q.key, label: q.label })),
    ),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename(h.name, "team-assignments")}"`,
        // Every save changes this; a cached copy of the assignment from before
        // one is worse than a second round trip.
        "Cache-Control": "no-store",
      },
    },
  )
}
