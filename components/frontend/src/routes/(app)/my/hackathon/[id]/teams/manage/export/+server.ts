import type { RequestHandler } from "./$types"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { requireGrpc } from "$lib/server/grpc/client"
import { viewerMembership } from "$lib/server/hackathon/membership"
import { numberedProjects } from "$lib/server/hackathon/projectNumbers"
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

  // The page's own numbering, from the same helper, so a number in this file
  // names the project the page shows under it.
  const numbered = numberedProjects(projects)
  const byId = new Map(numbered.map((p) => [p.id, p]))

  // As the page's "Prefers 3, 7": numbers, in project order, and only for
  // projects that have one — a preference for a project not on offer has no
  // row to be placed on, here as there.
  const prefersByUser = new Map<string, string[]>()
  for (const p of numbered) {
    for (const u of p.preferences) {
      prefersByUser.set(u.id, [
        ...(prefersByUser.get(u.id) ?? []),
        String(p.number),
      ])
    }
  }

  // A column per question, free text included: the spreadsheet is where teams
  // are planned, and "which university" or "what can you do" is often exactly
  // what decides who goes together. A long answer stays in its one cell — the
  // writer quotes line breaks. A tick-box reads as Yes or No, which is what a
  // person editing a spreadsheet expects to see in a column.
  //
  // Written as stored, with no apostrophe in front of an answer starting `=`,
  // the same choice `csvRow` makes for names; see there.
  const columns = questionRows(questions.questions)
  const answersByUser = answersByParticipant(columns, answers)
  const answersFor = (userId: string): Record<string, string> => {
    const filed = answersByUser[userId] ?? []
    const out: Record<string, string> = {}
    for (const a of filed) {
      out[a.key] =
        typeof a.value === "boolean" ? (a.value ? "Yes" : "No") : a.value
    }

    return out
  }

  const person = (
    id: string,
    name: string,
    project: { number: number; title: string } | undefined,
    teamName: string,
  ): AssignmentRow => ({
    userId: id,
    name,
    project: project ? String(project.number) : "",
    team: teamName,
    prefers: prefersByUser.get(id) ?? [],
    answers: answersFor(id),
  })

  // Grouped the way the screen is — by project number, then by team — because
  // the file is for reading a team as a block and moving somebody out of it,
  // not for looking one person up. Unassigned last, which is where the pool
  // sits.
  const rows: AssignmentRow[] = []
  const placed = teams
    .map((t) => ({ ...t, project: byId.get(t.projectId) }))
    .filter(
      (t): t is typeof t & { project: NonNullable<typeof t.project> } =>
        t.project !== undefined,
    )
    .sort(
      (a, b) =>
        a.project.number - b.project.number || a.name.localeCompare(b.name),
    )
  for (const t of placed) {
    const members = [...t.members].sort((a, b) =>
      (a.displayName || a.username).localeCompare(b.displayName || b.username),
    )
    for (const m of members) {
      rows.push(person(m.id, m.displayName || m.username, t.project, t.name))
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
  for (const p of pool) rows.push(person(p.id, p.name, undefined, ""))

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
