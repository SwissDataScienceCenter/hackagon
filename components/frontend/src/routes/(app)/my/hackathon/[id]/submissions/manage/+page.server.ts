import type { PageServerLoad } from "./$types"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { requireGrpc } from "$lib/server/grpc/client"
import { mayViewAllSubmissions } from "$lib/server/hackathon/capabilities"
import { namesByUserId } from "$lib/server/hackathon/membership"
import {
  submissionOverview,
  submissionsByTeam,
} from "$lib/server/hackathon/submissions"
import { listVisibleTeams } from "$lib/server/hackathon/teams"
import { markdownExcerpt } from "$lib/utils/markdown"
import { PROJECT_EXCERPT_CHARS } from "$lib/utils/projectExcerpt"
import { error } from "@sveltejs/kit"

// The organiser's overview: every team, where it stands with its submission,
// and what it has filed.
//
// **Read only.** An owner may read every submission but write none — saving
// one is team-scoped and granted to `Member` only (see `mayViewAllSubmissions`)
// — so the page has no actions. Chasing a team that has not submitted happens
// outside the app.
export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership, hackathonState } = await event.parent()

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  // Frontend-only gate, same shape as the other manage routes; the RPCs below
  // enforce it for real.
  if (!mayViewAllSubmissions(myMembership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can see every team's submissions")
  }

  const { team } = requireGrpc(event.locals.grpc)

  // Whether teams can save their submission right now — the banner's subject.
  const submissionsOpen = hackathonState.enabled.includes(
    Capability.CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
  )

  // Through `listVisibleTeams` rather than a bare `List`: an owner holds
  // `team:read` unconditionally, but a global admin who does not own this
  // hackathon is untested (see `submissions-need-view-teams`), and a refusal
  // should read as one rather than as a 500.
  const teams = await listVisibleTeams(team, hackathon.id)
  if (teams === undefined) {
    return {
      hackathonId: hackathon.id,
      submissionsOpen,
      teamsReadable: false,
      rows: [],
    }
  }

  // Who saved each entry comes back as a bare id. Owners included, as on the
  // other manage pages: an organiser who never joined holds no member row.
  const names = namesByUserId(hackathon.members, hackathon.owners)
  const projects = new Map(hackathon.projects.map((p) => [p.id, p]))

  // Every team, whichever tab is open. The tab is applied on the page, for two
  // reasons: a search has to see every team to say which tab its matches are
  // on, and a load that never reads `?standing=` is one SvelteKit does not
  // re-run when only the tab changes — switching tabs would otherwise repeat
  // the `ListSubmissions`.
  return {
    hackathonId: hackathon.id,
    submissionsOpen,
    teamsReadable: true,
    // What a row shows, as on the Submissions list: the description cut to a
    // row's worth, or a link when there is none. The whole entry is read on
    // the team's own submission page, which View opens.
    rows: submissionOverview(
      teams,
      await submissionsByTeam(team, hackathon.id),
      projects,
      names,
    ).map(({ entry, ...row }) => {
      const excerpt = entry?.description
        ? markdownExcerpt(entry.description, PROJECT_EXCERPT_CHARS)
        : ""

      return {
        ...row,
        excerpt: excerpt || undefined,
        link: excerpt
          ? undefined
          : (entry?.repositoryUrl ?? entry?.attachmentFolderUrl),
        updatedAt: entry?.updatedAt,
        updatedBy: entry?.updatedBy,
      }
    }),
  }
}
