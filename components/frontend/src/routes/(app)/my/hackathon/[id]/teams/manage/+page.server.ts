import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import {
  MAX_IMPORT_BYTES,
  initialsOf,
  parseRosterFile,
  resolveImport,
} from "$lib/server/hackathon/teamImport"
import { importWorld } from "$lib/server/hackathon/teamImportWorld"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * One answer, as a string an organiser can read and a filter can match.
 *
 * Registration answers arrive as a protobuf Struct, so a value is whatever the
 * organiser's field type produced — text, a number, a checkbox, a multi-select.
 * Rendering the raw JSON would put `["a","b"]` on screen.
 */
function formatAnswer(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (Array.isArray(value))
    return value.map(formatAnswer).filter(Boolean).join(", ")
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value).trim()
}

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const {
    team,
    project,
    hackathon: hackathonClient,
  } = requireGrpc(event.locals.grpc)

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  const isHackathonOwner =
    myMembership?.role === HackathonRole.HACKATHON_ROLE_OWNER

  // Frontend-only gate, same as the projects page's `mayReview` — the RPCs
  // below enforce it for real, this just decides whether to render the page.
  if (!isHackathonOwner && !isAdmin) {
    error(403, "You don't have permission to manage teams here")
  }

  const { teams } = await team.list({ hackathonId: event.params.id })

  // Who prefers what, per project — same `Project:Write` permission this page
  // is already gated on, so no separate check is needed here.
  const { projects: preferences } = await project.exportPreferences({
    hackathonId: event.params.id,
  })

  // Inverted: which project(s) a given user prefers, shown on their chip
  // rather than on the project row.
  const preferredTitlesByUser = new Map<string, string[]>()
  for (const p of preferences) {
    for (const u of p.preferences) {
      const titles = preferredTitlesByUser.get(u.id) ?? []
      titles.push(p.title)
      preferredTitlesByUser.set(u.id, titles)
    }
  }

  // What people wrote about themselves when they registered. One call for the
  // whole cohort — the per-user RPC would be a round-trip per row. Organiser
  // only, which this page already is; a failure costs the answers, not the
  // board, because staffing must stay possible if the form was never set up.
  const answersByUser = new Map<string, { label: string; value: string }[]>()
  const registrationFields = hackathon.registrationForm?.fields ?? []
  try {
    const { responses } = await hackathonClient.listRegistrationResponses({
      hackathonId: event.params.id,
    })
    for (const r of responses) {
      const fields = Object.entries(r.responses ?? {})
        .map(([key, value]) => ({
          // The stored key is the organiser's field id; show the label they
          // wrote for it, falling back to the key so a question removed from
          // the schema still reads as something rather than vanishing.
          label: registrationFields.find((f) => f.key === key)?.label ?? key,
          value: formatAnswer(value),
        }))
        .filter((f) => f.value !== "")
      answersByUser.set(r.userId, fields)
    }
  } catch {
    // Left empty on purpose — see above.
  }

  // Profiles, keyed by user id. `hackathon.members` already carries the whole
  // User — affiliation and skills included — so staffing a team no longer means
  // opening each person's profile in another tab to find out what they do.
  const profileById = new Map(
    hackathon.members
      .filter((m) => m.user)
      .map((m) => [
        m.user!.id,
        {
          affiliation: m.user!.affiliation ?? "",
          skills: m.user!.skills ?? "",
        },
      ]),
  )

  const toPerson = (id: string, name: string) => ({
    id,
    name,
    preferredTitles: preferredTitlesByUser.get(id) ?? [],
    ...(profileById.get(id) ?? { affiliation: "", skills: "" }),
  })

  const teamsById = teams.map((t) => ({
    id: t.id,
    name: t.name,
    projectId: t.projectId,
    members: t.members.map((m) => toPerson(m.id, m.displayName || m.username)),
  }))

  // A participant belongs to at most one team, so anyone confirmed and not on
  // a team is in the pool.
  const assignedIds = new Set(teams.flatMap((t) => t.members.map((m) => m.id)))
  const unassigned = hackathon.members
    .filter((m) => !m.isWaiting && m.user && !assignedIds.has(m.user.id))
    .map((m) => toPerson(m.user!.id, m.user!.displayName || m.user!.username))

  const teamsByProject = new Map<string, typeof teamsById>()
  for (const t of teamsById) {
    const list = teamsByProject.get(t.projectId) ?? []
    list.push(t)
    teamsByProject.set(t.projectId, list)
  }

  // One row per approved project, so its team(s) can be created and staffed
  // here. A project that already has a team but isn't approved (edge case:
  // seed data has one) still gets a row — otherwise that team would have no
  // drop zone anywhere on this page — tagged so it doesn't read as a mistake.
  const projectRows = preferences
    .filter(
      (p) =>
        p.status === ProjectStatus.PROJECT_STATUS_APPROVED ||
        teamsByProject.has(p.id),
    )
    .map((p) => ({
      id: p.id,
      title: p.title,
      isApproved: p.status === ProjectStatus.PROJECT_STATUS_APPROVED,
      teams: teamsByProject.get(p.id) ?? [],
    }))

  // One row per confirmed participant, whether or not they are on a team, each
  // carrying where they ended up. The board answers "who is on this project?";
  // this answers "where is this person, and what can they do?" — which is the
  // question an organiser actually has while staffing, and which the board
  // cannot answer without scanning every column.
  const teamNameByUser = new Map<string, string>()
  for (const t of teamsById) {
    for (const m of t.members) teamNameByUser.set(m.id, t.name)
  }
  const roster = hackathon.members
    .filter((m) => !m.isWaiting && m.user)
    .map((m) => ({
      ...toPerson(m.user!.id, m.user!.displayName || m.user!.username),
      teamName: teamNameByUser.get(m.user!.id) ?? "",
      answers: answersByUser.get(m.user!.id) ?? [],
    }))
    // Unassigned first — they are the ones still needing a decision.
    .sort((a, b) => {
      if (!a.teamName !== !b.teamName) return a.teamName ? 1 : -1
      return a.name.localeCompare(b.name)
    })

  return {
    hackathonId: event.params.id,
    unassigned,
    projectRows,
    roster,
  }
}

export const actions: Actions = {
  createTeam: async (event) => {
    // No `parent()` here — actions get a plain `RequestEvent`, not a load
    // event — so the project lookup this needs re-fetches via `hackathon.get`.
    const { team, hackathon: hackathonClient } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const projectId = form.get("projectId")
    if (typeof projectId !== "string" || projectId === "") {
      return fail(400, { message: "Missing project" })
    }

    const { hackathon } = await hackathonClient.get({
      hackathonId: event.params.id,
    })
    const proj = hackathon?.projects.find((p) => p.id === projectId)
    if (!hackathon || !proj) {
      return fail(404, { message: "Project not found" })
    }
    const base = `Team ${initialsOf(proj.title)}`

    const { teams: existing } = await team.list({
      hackathonId: event.params.id,
    })
    const teamCount = existing.filter((t) => t.projectId === projectId).length
    const name = teamCount === 0 ? base : `${base} ${teamCount + 1}`

    try {
      await team.create({ projectId, name, description: "" })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to create teams here",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Project not found" })
      }
      throw e
    }

    return { success: true }
  },

  renameTeam: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const teamId = form.get("teamId")
    const name = form.get("name")
    if (typeof teamId !== "string" || teamId === "") {
      return fail(400, { message: "Missing team" })
    }
    if (typeof name !== "string" || name.trim().length < 3) {
      return fail(400, { message: "Team name must be at least 3 characters" })
    }

    try {
      await team.edit({ id: teamId, name })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to rename this team",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Team not found" })
      }
      throw e
    }

    return { success: true }
  },

  deleteTeam: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const teamId = form.get("teamId")
    if (typeof teamId !== "string" || teamId === "") {
      return fail(400, { message: "Missing team" })
    }

    try {
      await team.delete({ id: teamId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to delete this team",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Team not found" })
      }
      throw e
    }

    return { success: true }
  },

  // Moves a participant to `toTeamId`, or unassigns them when it is empty. The
  // backend allows a user on several teams, so the single-team rule is
  // enforced here: every other team membership in this hackathon is removed
  // first.
  move: async (event) => {
    const { team } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const userId = form.get("userId")
    const toTeamId = form.get("toTeamId")
    if (typeof userId !== "string" || userId === "") {
      return fail(400, { message: "Select a participant to move" })
    }
    if (typeof toTeamId !== "string") {
      return fail(400, { message: "Missing target team" })
    }

    try {
      const current = await team.list({ hackathonId: event.params.id })
      const leaving = current.teams.filter(
        (t) => t.id !== toTeamId && t.members.some((m) => m.id === userId),
      )

      for (const t of leaving) {
        await team.removeUser({ teamId: t.id, userId })
      }
      if (toTeamId !== "") {
        await team.assignUser({ teamId: toTeamId, userId })
      }
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to manage these teams",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "Team or participant not found" })
      }
      throw e
    }

    return { success: true }
  },

  // Dry run. Reads the uploaded file, resolves every row against the live
  // roster and reports what WOULD happen — nothing is written here. An
  // irreversible bulk mutation fired by a file picker is a trap; the organiser
  // sees the moves, the new teams and the unresolved rows first.
  //
  // Access: `importWorld` calls `ExportPreferences` first, which the backend
  // guards with `Project:Write`, so this action is organiser-only for real and
  // not merely because `load` refuses to render the page.
  previewImport: async (event) => {
    const grpc = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const file = form.get("file")
    if (!(file instanceof File) || file.size === 0) {
      return fail(400, { importError: "Choose a CSV or JSON file to import." })
    }
    if (file.size > MAX_IMPORT_BYTES) {
      return fail(400, {
        importError: `That file is ${Math.round(file.size / 1024)} KB; the import accepts up to ${Math.round(
          MAX_IMPORT_BYTES / 1024,
        )} KB.`,
      })
    }

    const text = await file.text()
    const parsed = parseRosterFile(text, file.name)
    if (!parsed.ok) {
      return fail(400, {
        importError: `${file.name}: ${parsed.message}.`,
      })
    }

    let world
    try {
      world = await importWorld(grpc, event.params.id)
    } catch (e) {
      return importFailure(e)
    }

    return {
      importPreview: {
        filename: file.name,
        // Echoed back so Apply can re-parse the SAME file. The plan is never
        // trusted from the client: ids in a hidden field would be a way to
        // assign anyone to anything.
        fileText: text,
        plan: resolveImport(parsed.rows, world),
      },
    }
  },

  // Apply a previewed import.
  //
  // Re-parses and re-resolves from scratch against the CURRENT roster, so a
  // plan that went stale between preview and apply (someone else moved a
  // person, a team was deleted) is refused rather than replayed. One bad row
  // still blocks the whole file: the validation half is all-or-nothing on
  // purpose, because a partial import the organiser believes succeeded is worse
  // than a rejected one.
  //
  // The writes themselves cannot be atomic — team membership lands in two
  // stores that share no transaction (see teamImport.ts) — so what this reports
  // is what it managed, per row, and never "done" when anything failed.
  applyImport: async (event) => {
    const grpc = requireGrpc(event.locals.grpc)
    const { team } = grpc
    const form = await event.request.formData()

    const text = String(form.get("fileText") ?? "")
    const filename = String(form.get("filename") ?? "import.csv")
    if (text.trim() === "") {
      return fail(400, { importError: "Nothing to apply — preview a file first." })
    }

    const parsed = parseRosterFile(text, filename)
    if (!parsed.ok) {
      return fail(400, { importError: `${filename}: ${parsed.message}.` })
    }

    let world
    try {
      world = await importWorld(grpc, event.params.id)
    } catch (e) {
      return importFailure(e)
    }

    const plan = resolveImport(parsed.rows, world)
    if (plan.counts.errors > 0) {
      return fail(400, {
        importError: `The roster changed since the preview — ${plan.counts.errors} of ${plan.counts.total} rows no longer resolve. Nothing was applied.`,
        importPreview: { filename, fileText: text, plan },
      })
    }

    // Create the new teams first: their ids are what the rows below assign into.
    const newTeamIds: string[] = []
    const failures: { row: number; email: string; message: string }[] = []
    for (const [i, t] of plan.creates.entries()) {
      try {
        const { teamId } = await team.create({
          projectId: t.projectId,
          name: t.name,
          description: "",
        })
        newTeamIds[i] = teamId
      } catch (e) {
        failures.push({
          row: 0,
          email: "",
          message: `could not create the team "${t.name}": ${grpcMessage(e)}`,
        })
      }
    }

    let applied = 0
    for (const row of plan.rows) {
      if (row.status === "unchanged" || row.status === "error") continue
      const targetId =
        row.target?.startsWith("new:") ?
          newTeamIds[Number(row.target.slice(4))]
        : (row.target ?? null)
      if (row.target?.startsWith("new:") && !targetId) {
        // Its team failed to be created; the failure is already reported above
        // and re-reporting it per row would bury it.
        continue
      }

      try {
        // Same single-team rule the drag board enforces: leave everything else
        // first, then join. The backend permits several teams; the product does
        // not.
        for (const leaving of row.leave ?? []) {
          await team.removeUser({ teamId: leaving, userId: row.userId! })
        }
        // Not when they are already on it: `team_participants` is keyed on
        // (user_id, team_id), so a second AddMembers is a constraint violation
        // and `AssignUser` answers Internal. A row that only sheds a second,
        // stale membership would otherwise report a failure having done exactly
        // what was asked.
        if (targetId && !row.alreadyOnTarget) {
          await team.assignUser({ teamId: targetId, userId: row.userId! })
        }
        applied += 1
      } catch (e) {
        failures.push({
          row: row.row,
          email: row.email,
          message: grpcMessage(e),
        })
      }
    }

    return {
      importResult: {
        filename,
        applied,
        planned: plan.counts.changes,
        created: newTeamIds.filter(Boolean).length,
        failures,
      },
    }
  },
}

/** A form failure carrying the gRPC status this surface owes the organiser. */
function importFailure(e: unknown) {
  if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
    return fail(403, {
      importError: "Only this event's organizers can import team composition.",
    })
  }
  if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
    return fail(404, { importError: "Hackathon not found." })
  }
  throw e
}

/** The server's own words, so a failed row says why rather than "failed". */
function grpcMessage(e: unknown): string {
  if (e instanceof ClientError) return e.details || e.message

  return e instanceof Error ? e.message : String(e)
}
