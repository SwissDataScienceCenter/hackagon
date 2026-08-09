import type { RequestHandler } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// ProjectStatus: PROPOSED=1, APPROVED=2
const STATUS_LABEL: Partial<Record<number, string>> = {
  1: "proposed",
  2: "approved",
}

/** RFC 4180 quoting: a field is safe only once its own quotes are doubled. */
function csvCell(v: string): string {
  return `"${v.replaceAll('"', '""')}"`
}

// Who wants to work on what, as a file an organizer can sort teams from.
// ExportPreferences is Project.Write, so the backend refuses anyone who is not
// an organizer and this endpoint just relays that.
export const GET: RequestHandler = async (event) => {
  const { project } = requireGrpc(event.locals.grpc)

  let res
  try {
    res = await project.exportPreferences({ hackathonId: event.params.id })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED)
      error(403, "Only this event's organizers can export preferences")
    if (e instanceof ClientError && e.code === Status.NOT_FOUND)
      error(404, "Hackathon not found")
    throw e
  }

  const rows = [["project", "status", "participant", "username", "email"]]
  for (const p of res.projects) {
    const status = STATUS_LABEL[p.status] ?? "unknown"
    if (p.preferences.length === 0) {
      rows.push([p.title, status, "", "", ""])
      continue
    }
    for (const u of p.preferences) {
      rows.push([
        p.title,
        status,
        u.displayName || u.username,
        u.username,
        u.email,
      ])
    }
  }

  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n")

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="preferences-${event.params.id}.csv"`,
    },
  })
}
