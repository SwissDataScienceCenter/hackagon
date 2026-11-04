import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { namesByUserId } from "$lib/server/hackathon/membership"
import { teamEntries } from "$lib/server/hackathon/submissions"

// Every team's entry, read only — the page behind the sidebar's Submissions
// entry. The viewer's own team edits theirs one level down, on Our submission.
//
// Readable by whoever may see team assignments, the same rule as a team's own
// page: the entries come through `teamEntries`, as the ballot's do, so this
// page and the ballot list the same thing. A team without an entry is left
// out, as on the ballot; the count in the heading says how many there are.
export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  const rows = await teamEntries(
    team,
    hackathon.id,
    namesByUserId(hackathon.members, hackathon.owners),
  )
  const projectTitles = new Map(hackathon.projects.map((p) => [p.id, p.title]))

  // Field by field rather than the whole entry: only what the card shows
  // leaves the server.
  const entries = (rows ?? [])
    .flatMap(({ team: t, entry }) =>
      entry
        ? [
            {
              teamId: t.id,
              teamName: t.name,
              projectTitle: projectTitles.get(t.projectId) ?? "Unknown project",
              isOwn: t.members.some((m) => m.id === platformUserId),
              repositoryUrl: entry.repositoryUrl,
              attachmentFolderUrl: entry.attachmentFolderUrl,
              description: entry.description,
              updatedAt: entry.updatedAt,
              updatedBy: entry.updatedBy,
            },
          ]
        : [],
    )
    // By project, as the teams list groups them, so a project's teams sit
    // together. Not by date: a card would jump to the top on every save.
    .sort(
      (a, b) =>
        a.projectTitle.localeCompare(b.projectTitle) ||
        a.teamName.localeCompare(b.teamName),
    )

  return {
    hackathonId: hackathon.id,
    teamsPublished: rows !== undefined,
    teamCount: rows?.length ?? 0,
    entries,
  }
}
