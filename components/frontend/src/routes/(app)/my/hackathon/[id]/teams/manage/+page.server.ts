import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import { participantRowFor } from "$lib/server/hackathon/membership"
import { listAnswers } from "$lib/server/hackathon/questions"
import {
  answerLegend,
  questionRows,
  type AnswerLegend,
} from "$lib/server/hackathon/registrationForm"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

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

  // The projects that get a row, in the order they get it. A project's
  // position is the number shown on its row and on every preference that names
  // it — with fifteen projects and a hundred people, full titles on every
  // participant row are unreadable, and a number that matches the row above is
  // not.
  //
  // One row per approved project, and nothing else. A team belongs to an
  // approved project: offering a drop zone on a proposal still under review is
  // offering to build a team for something that may be rejected, and the rest of
  // the app now refuses to show that state at all — the teams list and a team's
  // own page each link a project only once it is approved.
  //
  // This used to give a row to any project that already had a team whatever its
  // status, so such a team had somewhere to sit. That is now `save`'s problem
  // instead: it leaves a team whose project has no row alone rather than
  // deleting it, which is the part that actually mattered. Nothing here can
  // create one — TODO(backend: team-create-requires-approved-project) is what
  // stops the API from doing so.
  const rowProjects = preferences.filter(
    (p) => p.status === ProjectStatus.PROJECT_STATUS_APPROVED,
  )
  const numberByProjectId = new Map(rowProjects.map((p, i) => [p.id, i + 1]))

  // What people said about themselves on the way in, as codes short enough to
  // sit beside a name. Fixed-list questions only — see `answerLegend`.
  //
  // Decoration, and fetched as such: the page assigns teams with or without it,
  // so a refusal leaves an empty legend and no ticks rather than a failed page.
  // That is reachable — a global admin passes the gate above while holding no
  // membership, which is what `ListQuestions` answers on.
  let legend: AnswerLegend = { questions: [], codesByParticipant: {} }
  try {
    const [questions, answers] = await Promise.all([
      hackathonClient.listQuestions({ hackathonId: event.params.id }),
      listAnswers(hackathonClient, event.params.id),
    ])
    legend = answerLegend(questionRows(questions.questions), answers)
  } catch {
    // Left empty on purpose.
  }

  // Inverted: which project(s) a given user prefers, shown on their row
  // rather than on the project row.
  const preferredByUser = new Map<string, { id: string; title: string }[]>()
  for (const p of preferences) {
    for (const u of p.preferences) {
      const list = preferredByUser.get(u.id) ?? []
      list.push({ id: p.id, title: p.title })
      preferredByUser.set(u.id, list)
    }
  }

  // Three views of the same preference set, each earning its place: numbers are
  // what the row shows, titles are what its tooltip spells out, and ids are what
  // the suggested distribution matches on — nothing guarantees two projects
  // cannot share a title.
  //
  // A preference for a project with no row has no number, and is dropped from
  // that list rather than shown as a gap: it cannot be assigned here either.
  const toPerson = (id: string, name: string) => {
    const preferred = preferredByUser.get(id) ?? []

    return {
      id,
      name,
      // Keyed by question so the page can show the ticked ones and nothing
      // else. Empty for anyone who answered no fixed-list question.
      codes: legend.codesByParticipant[id] ?? {},
      preferredTitles: preferred.map((p) => p.title),
      preferredProjectIds: preferred.map((p) => p.id),
      preferredNumbers: preferred
        .map((p) => numberByProjectId.get(p.id))
        .filter((n) => n !== undefined)
        .sort((a, b) => a - b),
    }
  }

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

  const projectRows = rowProjects.map((p, i) => ({
    id: p.id,
    number: i + 1,
    title: p.title,
    interested: p.preferences.length,
    teams: teamsByProject.get(p.id) ?? [],
  }))

  return {
    hackathonId: event.params.id,
    unassigned,
    projectRows,
    // Every fixed-list question, lettered — not only the ones an organizer has
    // chosen to show. Which of them to show is a preference of one person at
    // one screen, so it is kept in their browser and never reaches here.
    answerQuestions: legend.questions,
    // Whether to explain the organiser's own absence from the pool. They hold no
    // participant row unless they joined the hackathon the ordinary way, and
    // `unassigned` is built from participant rows — so an organiser looking for
    // their own name finds nothing, which reads as this page having lost them
    // rather than as a state they are in. Stated, not offered: taking part is
    // joining, and joining does not belong on a team-assignment screen.
    ownerMissingFromPool:
      isHackathonOwner &&
      participantRowFor(hackathon.members, event.locals.platformUser?.id) ===
        undefined,
  }
}

export const actions: Actions = {
  // The page is a workspace: every edit — dragging someone, adding a team,
  // renaming, deleting, accepting a suggestion — happens in the browser and
  // nothing reaches the backend until this runs. One action, because there is
  // one gesture: Save.
  //
  // What arrives is the **complete** desired state of every team in this
  // hackathon, so a team the plan does not mention has been deleted. This works
  // out the difference against what is stored and writes only that.
  //
  // There is no bulk RPC, so the cost is one round trip per team created,
  // deleted or renamed, plus one or two per person who actually moves.
  // Distributing a hundred people is a few hundred sequential calls and takes a
  // noticeable moment; that is a backend gap, not a client one.
  save: async (event) => {
    const { team, project } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const raw = form.get("teams")
    if (typeof raw !== "string" || raw === "") {
      return fail(400, { message: "Nothing to save" })
    }

    let plan: PlannedTeam[]
    try {
      plan = JSON.parse(raw)
    } catch {
      return fail(400, { message: "Could not read the changes" })
    }
    if (!Array.isArray(plan) || !plan.every(isPlannedTeam)) {
      return fail(400, { message: "Could not read the changes" })
    }
    if (plan.some((t) => t.name.trim().length < 3)) {
      return fail(400, {
        message: "Every team needs a name of at least 3 characters",
      })
    }

    try {
      const { teams: all } = await team.list({
        hackathonId: event.params.id,
      })
      const keep = new Set(
        plan.map((t) => t.id).filter((id): id is string => id !== null),
      )

      // Only the teams this page could actually show are in scope. The load gives
      // a row to approved projects alone, so a team on a project at any other
      // status cannot appear in `plan` — and "absent from the plan" is how this
      // action recognises a deletion. Without this filter, saving any unrelated
      // change would silently destroy a team the organiser never saw.
      //
      // Such a team should not exist: nothing in the frontend can create one, and
      // TODO(backend: team-create-requires-approved-project) is the API half.
      // Until that lands this is what keeps the page from being the thing that
      // deletes it.
      const { projects: statuses } = await project.exportPreferences({
        hackathonId: event.params.id,
      })
      const approved = new Set(
        statuses
          .filter((p) => p.status === ProjectStatus.PROJECT_STATUS_APPROVED)
          .map((p) => p.id),
      )
      const before = all.filter((t) => approved.has(t.projectId))

      // Deletions first, so their members are free before anything is assigned
      // and a name being reused is no longer taken.
      for (const t of before) {
        if (!keep.has(t.id)) await team.delete({ id: t.id })
      }

      // Then creations and renames, so every team the plan names exists with
      // the name it should have before members are placed into it.
      const nameBefore = new Map(before.map((t) => [t.id, t.name]))
      const wanted = new Map<string, string[]>()
      for (const t of plan) {
        let teamId = t.id
        if (teamId === null) {
          const created = await team.create({
            projectId: t.projectId,
            name: t.name,
            description: "",
          })
          teamId = created.teamId
        } else if (nameBefore.get(teamId) !== t.name) {
          await team.edit({ id: teamId, name: t.name })
        }
        wanted.set(teamId, t.memberIds)
      }

      // Finally the membership difference. A deleted team's members count as
      // already unassigned, which is why `keep` filters them out here.
      const current = new Map<string, string>()
      for (const t of before) {
        if (!keep.has(t.id)) continue
        for (const m of t.members) current.set(m.id, t.id)
      }
      const target = new Map<string, string>()
      for (const [teamId, memberIds] of wanted) {
        for (const userId of memberIds) target.set(userId, teamId)
      }

      for (const userId of new Set([...current.keys(), ...target.keys()])) {
        const from = current.get(userId)
        const to = target.get(userId)
        if (from === to) continue
        // Leave before joining: the one-team-per-person rule is the frontend's
        // to keep, because the backend allows somebody on several at once.
        if (from !== undefined) await team.removeUser({ teamId: from, userId })
        if (to !== undefined) await team.assignUser({ teamId: to, userId })
      }
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, { message: e.details })
      }
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          message: "You don't have permission to manage these teams",
        })
      }
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, { message: "A team or participant no longer exists" })
      }
      throw e
    }

    return { success: true }
  },
}

/** One team as the page's workspace wants it to end up. */
type PlannedTeam = {
  /** `null` for a team added in the browser that must still be created. */
  id: string | null
  projectId: string
  name: string
  memberIds: string[]
}

function isPlannedTeam(value: unknown): value is PlannedTeam {
  if (typeof value !== "object" || value === null) return false
  const t = value as Record<string, unknown>

  return (
    (t.id === null || typeof t.id === "string") &&
    typeof t.projectId === "string" &&
    t.projectId !== "" &&
    typeof t.name === "string" &&
    Array.isArray(t.memberIds) &&
    t.memberIds.every((m) => typeof m === "string" && m !== "")
  )
}
