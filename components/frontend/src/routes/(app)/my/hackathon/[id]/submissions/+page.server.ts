import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayCreateSubmissions } from "$lib/server/hackathon/capabilities"
import { namesByUserId } from "$lib/server/hackathon/membership"
import { enabledCapabilities } from "$lib/server/hackathon/phaseForm"
import { teamEntries } from "$lib/server/hackathon/submissions"
import { markdownExcerpt } from "$lib/utils/markdown"
import { PROJECT_EXCERPT_CHARS } from "$lib/utils/projectExcerpt"

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
  const projects = new Map(hackathon.projects.map((p) => [p.id, p]))

  // Only what the row shows leaves the server: an excerpt, not the
  // description — the entry is read in full on its own page.
  const cards = (rows ?? []).map(({ team: t, entry }) => {
    const project = projects.get(t.projectId)
    // As long as a project row's, so the two lists read alike.
    const excerpt = entry?.description
      ? markdownExcerpt(entry.description, PROJECT_EXCERPT_CHARS)
      : ""

    return {
      teamId: t.id,
      teamName: t.name,
      projectTitle: project?.title ?? "Unknown project",
      // TODO(backend: team-image): the project's, as on the team's page.
      imageUrl: project?.image,
      isOwn: t.members.some((m) => m.id === platformUserId),
      entry: entry
        ? {
            excerpt: excerpt || undefined,
            // Only without an excerpt: an entry that is nothing but a link
            // would otherwise say nothing on its row.
            link: excerpt
              ? undefined
              : (entry.repositoryUrl ?? entry.attachmentFolderUrl),
            updatedAt: entry.updatedAt,
          }
        : null,
    }
  })

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
