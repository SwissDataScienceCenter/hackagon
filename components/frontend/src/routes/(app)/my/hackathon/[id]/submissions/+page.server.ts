import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayCreateSubmissions } from "$lib/server/hackathon/capabilities"
import { namesByUserId } from "$lib/server/hackathon/membership"
import { enabledCapabilities } from "$lib/server/hackathon/phaseForm"
import { teamEntries } from "$lib/server/hackathon/submissions"

// Every team's entry, read only — the page behind the sidebar's Submissions
// entry. The viewer's own team edits theirs one level down, on Our submission.
//
// Readable by whoever may see team assignments, the same rule as a team's own
// page: the entries come through `teamEntries`, as the ballot's do, so this
// page and the ballot list the same thing. Another team without an entry is
// left out, as on the ballot; the count in the heading says how many there
// are. The viewer's own team is always shown, first, entry or not — it is the
// one card they came to check.
export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )

  const rows = await teamEntries(
    team,
    hackathon.id,
    namesByUserId(hackathon.members, hackathon.owners),
  )
  const projectTitles = new Map(hackathon.projects.map((p) => [p.id, p.title]))

  // Field by field rather than the whole entry: only what the card shows
  // leaves the server.
  const cards = (rows ?? []).map(({ team: t, entry }) => ({
    teamId: t.id,
    teamName: t.name,
    projectTitle: projectTitles.get(t.projectId) ?? "Unknown project",
    isOwn: t.members.some((m) => m.id === platformUserId),
    entry: entry
      ? {
          repositoryUrl: entry.repositoryUrl,
          attachmentFolderUrl: entry.attachmentFolderUrl,
          description: entry.description,
          updatedAt: entry.updatedAt,
          updatedBy: entry.updatedBy,
        }
      : null,
  }))

  return {
    hackathonId: hackathon.id,
    teamsPublished: rows !== undefined,
    teamCount: cards.length,
    submittedCount: cards.filter((c) => c.entry).length,
    // Whether the own team's card offers Edit — the same answer Our submission
    // gives on whether it shows a form. Closed, that page still shows the
    // entry, through the sidebar, so the card leaves the button out rather
    // than offer an edit that is refused.
    maySubmit: mayCreateSubmissions(
      myMembership ?? undefined,
      enabledCapabilities(hackathon.state).includes(
        Capability.CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
      ),
      isAdmin,
    ),
    ours: cards.filter((c) => c.isOwn),
    // By project, as the teams list groups them, so a project's teams sit
    // together. Not by date: a card would jump to the top on every save.
    others: cards
      .filter((c) => !c.isOwn && c.entry)
      .sort(
        (a, b) =>
          a.projectTitle.localeCompare(b.projectTitle) ||
          a.teamName.localeCompare(b.teamName),
      ),
  }
}
