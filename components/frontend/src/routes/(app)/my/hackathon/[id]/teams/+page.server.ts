import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * Every team in this hackathon and who is on it — the browse surface.
 *
 * Gated by a capability rather than a role: `TeamService.List` asks for
 * hackathon-scoped `team:read` (`team_service.go:59`), which a member holds only
 * while `CAPABILITY_VIEW_TEAMS` is on and an owner holds unconditionally
 * (`rbac.go:209`). It asked only for `hackathon:read` until that capability
 * landed. An organiser therefore sees this before participants do; renaming,
 * deleting and assigning people still live on `teams/manage`.
 *
 * The refusal below stays a 403 for now, which is the weaker answer: unpublished
 * assignments are a normal state of a hackathon rather than a permission the
 * reader got wrong, and the voting page renders an explanation in the same
 * situation instead. Nothing links here while the capability is off — the nav
 * entry needs a team count it cannot get, and `capabilityHref` only lists what is
 * open — so this is reachable by typed URL alone, and an explanatory empty state
 * can wait for someone to hit it.
 *
 * Its own `team.list` rather than the count the layout already fetched: the
 * layout returns a number and nothing more, so no page but this one carries a
 * team payload it does not render. Two calls land on this page as a result — see
 * `TODO(backend: hackathon-team-count)` in the layout for the round trip that
 * should not be needed at all.
 *
 * No submission on these rows. `List` eager-loads project, creator and members
 * but not submissions (`team_service.go:64-70`), so a finalized entry is a
 * detail-page thing — which is what the View link is for. `TeamCard` draws
 * nothing rather than "no entry yet" when it has none.
 */
export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  let teams
  try {
    ;({ teams } = await team.list({ hackathonId: event.params.id }))
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "Team assignments have not been published in this hackathon.")
    }
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Hackathon not found")
    }
    throw e
  }

  // The project a team is on, resolved out of the layout's `hackathon.get`
  // rather than fetched again. That list is filtered to what the viewer may see,
  // so a team can sit on a project missing from it — which is why every field
  // taken from it has a fallback rather than the row being dropped: a team the
  // backend just returned should not vanish because its project is not visible.
  const projectById = new Map(hackathon.projects.map((p) => [p.id, p]))

  const rows = teams.map((t) => {
    const project = projectById.get(t.projectId)

    return {
      id: t.id,
      name: t.name,
      // The project's title, for sorting and for the line above the card. The
      // card's own heading is the team name: this page is about who is on which
      // team, so the team is the subject here — the inverse of the detail page,
      // where the project a voter is judging is the heading.
      projectTitle: project?.title ?? "",
      projectDescription: project?.description ?? t.description ?? "",
      // TODO(backend: team-image): Team has no image of its own, so this is the
      // project's — there is no team URL for it to fall back *from* yet. Without
      // one the card shows its empty avatar. Same handle as the detail page's
      // load, so both sites grep as a set.
      imageUrl: project?.image,
      members: t.members.map((m) => ({ name: m.displayName || m.username })),
      isOwn: t.members.some((m) => m.id === platformUserId),
    }
  })

  // `List` returns whatever order the query produced, which is not stable enough
  // for a list people scan for a name. Project first so a project's teams sit
  // together; a team whose project the viewer cannot see sorts last rather than
  // first, since an empty title would otherwise head the list.
  rows.sort((a, b) => {
    if (a.projectTitle === "" && b.projectTitle !== "") return 1
    if (b.projectTitle === "" && a.projectTitle !== "") return -1
    return (
      a.projectTitle.localeCompare(b.projectTitle) ||
      a.name.localeCompare(b.name)
    )
  })

  return { hackathonId: event.params.id, teams: rows }
}
