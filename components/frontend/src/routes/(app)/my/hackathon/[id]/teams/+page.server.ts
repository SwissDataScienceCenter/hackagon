import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { submissionVersions } from "$lib/server/hackathon/submissions"
import { ClientError, Status } from "nice-grpc-common"

type TeamClient = ReturnType<typeof requireGrpc>["team"]

/** A team's finalized entry, as the card renders it. Null when it has none. */
interface FinalEntry {
  version: number
  result: string | undefined
  finalizedAt: Date | undefined
  finalizedBy: string | undefined
}

/**
 * The team's finalized entry, or null.
 *
 * TODO(backend: submission-cross-team-read): the filtering to finals happens
 * *here*, in the frontend, which is backwards. `TeamService.Get` eager-loads
 * every submission a team has and gates only on hackathon-scoped
 * `hackathon:read` (`team_service.go:99-101`, `:114-120`) — it never checks
 * `submission:read`. So it hands any confirmed participant every other team's
 * drafts, which `ListSubmissions` on the same team would refuse them
 * (`team_service.go:560-569`). This function is the reason none of that reaches
 * the browser: everything but `latestFinal` is dropped server-side.
 *
 * Once the ticket lands — a hackathon-wide, finals-only read path — switch to
 * that RPC and delete this. Do not build anything else on `Get`'s submissions
 * in the meantime.
 *
 * A refusal is swallowed rather than propagated, so this stays a decoration:
 * if the fix arrives as "`Get` now enforces `submission:read`" *without* a
 * member-wide policy, every call here starts returning PermissionDenied, and an
 * uncaught one would take down the whole roster over a link nobody can see
 * anyway. Any other status still throws.
 */
async function finalEntry(
  client: TeamClient,
  teamId: string,
  memberNames: Map<string, string>,
): Promise<FinalEntry | null> {
  try {
    const { team } = await client.get({ teamId })
    const { latestFinal } = submissionVersions(
      team?.submissions ?? [],
      memberNames,
    )
    if (!latestFinal) return null

    return {
      version: latestFinal.version,
      result: latestFinal.result,
      finalizedAt: latestFinal.finalizedAt,
      finalizedBy: latestFinal.finalizedBy,
    }
  } catch (err) {
    if (
      err instanceof ClientError &&
      (err.code === Status.PERMISSION_DENIED || err.code === Status.NOT_FOUND)
    ) {
      return null
    }
    throw err
  }
}

// No owner/admin check here: the way into team management is the sidebar's
// Manage section, which gates itself on the same subjects (see $lib/navigation's
// manageNav). This page is the participant view and reads the same for everyone.
export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()
  const { team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  // Teams are the one collection `hackathon.get` does not nest, so this page
  // needs its own call. No error translation here: `TeamService.List` gates on
  // the same Hackathon/Read permission the layout's `hackathon.get` already
  // passed, so a denial at this point is a backend inconsistency and should
  // surface rather than be dressed up as a 403.
  const { teams } = await team.list({ hackathonId: event.params.id })

  const projectsById = new Map(hackathon.projects.map((p) => [p.id, p]))

  // Newest first, matching the projects page.
  const ordered = [...teams].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  )

  // Finalizer names, resolved against every confirmed hackathon member rather
  // than the team's current roster — the person who finalized may since have
  // left the team. Same map and same fallback as the submissions page.
  const memberNames = new Map(
    hackathon.members
      .filter((m) => m.user !== undefined)
      .map((m) => [m.user!.id, m.user!.displayName || m.user!.username]),
  )

  // One extra round trip per team: `team.list` returns no submissions at all
  // (its query has no `WithSubmissions` — `team_service.go:62-67`), and
  // `listSubmissions` refuses any team the viewer is not on. `Get` is the only
  // read that works here, and it is per-team. Concurrent, so the cost is one
  // round trip's latency rather than N.
  const entries = await Promise.all(
    ordered.map((t) => finalEntry(team, t.id, memberNames)),
  )

  const rows = ordered.map((t, i) => {
    const project = projectsById.get(t.projectId)

    return {
      id: t.id,
      // TODO(backend: display-ordinals): positional, not an identifier — Team
      // has no display number. See the same note on the projects page.
      num: ordered.length - i,
      title: t.name,
      // Which project the team is on is the useful line here; the team's own
      // description is the fallback for a team whose project went missing.
      projectDescription: project?.title ?? t.description ?? "",
      // TODO(backend: team-image): Team has no image of its own, so this is the
      // project's. A team without one falls back to the card's empty avatar —
      // the four /images/hackathon-ord-2024/* files this page used to cycle
      // through were decorative filler, unrelated to any team.
      imageUrl: project?.image,
      members: t.members.map((m) => ({ name: m.displayName || m.username })),
      isOwn: t.members.some((m) => m.id === platformUserId),
      entry: entries[i],
    }
  })

  return { teams: rows, hackathonId: event.params.id }
}
