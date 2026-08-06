import type { RequestHandler } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { ExportFormat } from "$lib/server/grpc/generated/vote/messages/vote_svc/export_votes_request"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayPublishResults } from "$lib/server/hackathon/capabilities"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * Both exports return raw `bytes`, so they are served as a download rather than
 * rendered — hence a `+server.ts` and not a load.
 *
 * The filename is the route parameter, which is also what the browser saves as.
 * Four fixed names rather than `?what=&format=`: a download's name comes from
 * the URL unless a Content-Disposition says otherwise, and this way both agree
 * without a second source of truth.
 */
const FILES = {
  "results.csv": {
    what: "results",
    format: ExportFormat.EXPORT_FORMAT_CSV,
    type: "text/csv",
  },
  "results.json": {
    what: "results",
    format: ExportFormat.EXPORT_FORMAT_JSON,
    type: "application/json",
  },
  "votes.csv": {
    what: "votes",
    format: ExportFormat.EXPORT_FORMAT_CSV,
    type: "text/csv",
  },
  "votes.json": {
    what: "votes",
    format: ExportFormat.EXPORT_FORMAT_JSON,
    type: "application/json",
  },
} as const

export const GET: RequestHandler = async (event) => {
  const spec = FILES[event.params.file as keyof typeof FILES]
  if (!spec) error(404, "Unknown export")

  const { vote, hackathon } = requireGrpc(event.locals.grpc)

  // This route has no parent layout data to read a membership from — a
  // `+server.ts` does not run layout loads — so the check re-reads it. Skipping
  // it would still be safe (the RPCs enforce `vote_result:read` / `vote:read`
  // themselves, both owner-only), but a 403 from here is a better answer than a
  // download that turns out to be an error page.
  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  const { hackathon: h } = await hackathon.get({ hackathonId: event.params.id })
  const membership = h?.members.find(
    (m) => m.user?.id === event.locals.platformUser?.id,
  )
  if (!mayPublishResults(membership, isAdmin)) {
    error(403, "Only the hackathon organizer can export votes and results")
  }

  let data: Uint8Array
  try {
    const res =
      spec.what === "results"
        ? await vote.exportResults({
            categoryId: event.params.categoryId,
            format: spec.format,
          })
        : // ExportVotes takes a category_id, not a hackathon_id — there is no
          // whole-hackathon vote export, despite ListVotes accepting one.
          await vote.exportVotes({
            categoryId: event.params.categoryId,
            format: spec.format,
          })
    data = res.data
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You don't have permission to export this")
    }
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Voting category not found")
    }
    throw e
  }

  // Copied into a plain ArrayBuffer-backed view: ts-proto types `data` as
  // `Uint8Array<ArrayBufferLike>`, which is wider than the `BufferSource` that
  // `BodyInit` accepts (it admits SharedArrayBuffer, which a Response body
  // cannot be).
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": spec.type,
      "Content-Disposition": `attachment; filename="${event.params.file}"`,
      // A tally changes as votes come in and as an organizer edits placements;
      // a cached copy of yesterday's is worse than a second round trip.
      "Cache-Control": "no-store",
    },
  })
}
