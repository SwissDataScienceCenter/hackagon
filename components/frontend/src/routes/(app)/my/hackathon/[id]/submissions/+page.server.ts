import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

const STATUS_LABELS: Partial<Record<number, string>> = {
  1: "Draft",
  2: "Final",
}

export const load: PageServerLoad = async (event) => {
  const { team } = requireGrpc(event.locals.grpc)
  const { hackathon } = await event.parent()

  let teams
  try {
    teams = (await team.list({ hackathonId: event.params.id })).teams
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
      error(403, "Access denied")
    throw e
  }

  const teamNames = new Map(teams.map((t) => [t.id, t.name]))
  const projectTitles = new Map(hackathon.projects.map((p) => [p.id, p.title]))

  const perTeam = await Promise.all(
    teams.map((t) => team.listSubmissions({ teamId: t.id })),
  )

  return {
    submissions: perTeam
      .flatMap((r) => r.submissions)
      .map((s) => ({
        id: s.id,
        teamName: teamNames.get(s.teamId) ?? "",
        projectTitle: projectTitles.get(s.projectId) ?? "",
        status: STATUS_LABELS[s.status] ?? "Unknown",
        result: s.result ?? "",
      })),
  }
}
