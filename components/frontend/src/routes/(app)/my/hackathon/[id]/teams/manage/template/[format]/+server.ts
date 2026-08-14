import type { RequestHandler } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { buildTemplate } from "$lib/server/hackathon/teamImport"
import { importWorld } from "$lib/server/hackathon/teamImportWorld"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * The team-composition template: `user_email, project, team`, prefilled with
 * this event's own roster. `…/template/csv` or `…/template/json`.
 *
 * The format is a path segment rather than `?format=`, so both links are plain
 * resolvable routes (`svelte/no-navigation-without-resolve` cannot see through a
 * query string appended to a `resolve()` call).
 *
 * The organiser gate is a real backend check, not a page-level one: `importWorld`
 * calls `ExportPreferences`, which the backend guards with `Project:Write` — the
 * same permission the manage-teams page is already gated on. Without it any
 * confirmed member could pull the whole event's email addresses down as a file.
 */
export const GET: RequestHandler = async (event) => {
  const format = event.params.format
  if (format !== "csv" && format !== "json") {
    error(404, "Unknown template format")
  }

  let world
  try {
    world = await importWorld(requireGrpc(event.locals.grpc), event.params.id)
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
      error(403, "Only this event's organizers can download the team template")
    if (e instanceof ClientError && e.code === Status.NOT_FOUND)
      error(404, "Hackathon not found")
    throw e
  }

  return new Response(buildTemplate(world, format), {
    headers: {
      "content-type":
        format === "json"
          ? "application/json; charset=utf-8"
          : "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="teams-${event.params.id}.${format}"`,
    },
  })
}
