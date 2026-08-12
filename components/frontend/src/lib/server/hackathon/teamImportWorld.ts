import type { AuthorizedGrpc } from "$lib/server/grpc/client"
import type { ImportWorld } from "$lib/server/hackathon/teamImport"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"

/**
 * Everything the team-composition import and its template resolve against:
 * who is in this hackathon, which projects it has, and who is on which team.
 *
 * Server-only — it reads the generated enums and speaks gRPC, so it must never
 * be imported by a component.
 *
 * **This function is also the organiser gate.** `ExportPreferences` is guarded
 * by `Project:Write` on the backend, which is what "organizer of this event"
 * means here (`project_service.go:484`), so calling it FIRST turns any
 * non-organiser into a `PermissionDenied` before a single email address is read.
 * `hackathon.get` and `team.list` are member-level reads; on their own they
 * would happily hand a plain participant the whole roster as a file.
 *
 * Errors are deliberately not caught — the caller translates `ClientError` into
 * the HTTP answer its surface owes, exactly as everywhere else in this app.
 */
export async function importWorld(
  grpc: AuthorizedGrpc,
  hackathonId: string,
): Promise<ImportWorld> {
  // First, and on its own: this is the gate, and it must fail before any email
  // address is fetched.
  const { projects } = await grpc.project.exportPreferences({ hackathonId })

  const [{ hackathon }, { teams }] = await Promise.all([
    grpc.hackathon.get({ hackathonId }),
    grpc.team.list({ hackathonId }),
  ])

  return {
    participants: (hackathon?.members ?? [])
      .filter((m) => m.user)
      .map((m) => ({
        id: m.user!.id,
        email: m.user!.email,
        name: m.user!.displayName || m.user!.username,
        isWaiting: m.isWaiting,
      })),
    // Approved projects, plus any project that already carries a team — exactly
    // the rows the board itself renders, so the file can never name a project
    // the organiser has no column for. A team whose project was later
    // un-approved still has to be nameable, or its own members' rows would stop
    // resolving.
    projects: projects
      .filter(
        (p) =>
          p.status === ProjectStatus.PROJECT_STATUS_APPROVED ||
          teams.some((t) => t.projectId === p.id),
      )
      .map((p) => ({ id: p.id, title: p.title })),
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      projectId: t.projectId,
      memberIds: t.members.map((m) => m.id),
    })),
  }
}
