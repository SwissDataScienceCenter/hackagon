import type { RequestHandler } from "./$types"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManageParticipants } from "$lib/server/hackathon/capabilities"
import { requireGrpc } from "$lib/server/grpc/client"
import { viewerMembership } from "$lib/server/hackathon/membership"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

/**
 * The participant roster as a CSV, for import into a mailing tool.
 *
 * A `+server.ts` rather than a load, same reason as the vote export
 * (`voting/manage/[categoryId]/results/export/[file]`): this is a download, not
 * a page. Unlike that one it has no RPC handing it finished bytes — there is no
 * `ExportParticipants` — so it builds the file here out of the members
 * `Hackathon.Get` already returns.
 *
 * The filename lives in `Content-Disposition` rather than in the route, which is
 * the opposite of what the vote export argues for. It has to: that name is the
 * hackathon's, and a hackathon-dependent name cannot sit in a static route
 * segment. The anchor carries a bare `download` and lets this header name it.
 */

/** RFC 4180: quote anything holding a delimiter, a quote or a newline. */
function csvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value

  return `"${value.replaceAll('"', '""')}"`
}

/**
 * Values go out exactly as stored — no apostrophe in front of a name starting
 * `=`, `+`, `-` or `@`. That would defuse a spreadsheet's formula evaluation at
 * the cost of corrupting the actual name, and the consumer here is a mailing
 * tool, which evaluates nothing. UTF-8, and no BOM for the same reason.
 */
function csvRow(fields: string[]): string {
  return fields.map(csvField).join(",") + "\r\n"
}

/** `AI Hack 2026` -> `ai-hack-2026`, so downloads from two hackathons differ. */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return slug === "" ? "hackathon" : slug
}

export const GET: RequestHandler = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)

  // Same translation the hackathon layout does: a non-member gets a
  // PermissionDenied from `Get` itself, which without this would surface as a
  // 500 on a download.
  let h
  try {
    h = (await hackathon.get({ hackathonId: event.params.id })).hackathon
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You are not a confirmed member of this hackathon")
    }
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Hackathon not found")
    }
    throw e
  }
  if (!h) error(404, "Hackathon not found")

  // A `+server.ts` runs no layout loads, so the gate the manage page applies is
  // re-derived here. It carries more weight than the vote export's: `Get` is
  // readable by every member and hands out each member's email, so this check is
  // the only thing standing between a participant and the roster's addresses.
  //
  // Through `viewerMembership`, not a plain `members.find` — an organiser who
  // never joined their own hackathon holds ownership on the owners edge and no
  // participant row at all, since `Create` writes only the first. Finding them
  // by member row alone refuses the very person the page showed the button to,
  // which is exactly the 403 this replaces.
  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  const membership = viewerMembership(
    h.members,
    h.owners,
    event.locals.platformUser?.id,
    h.createdAt,
  )
  if (!mayManageParticipants(membership ?? undefined, isAdmin)) {
    error(403, "Only the hackathon organizer can export participants")
  }

  // Waitlisted participants are in the file, labelled — the same call the page
  // itself makes. Dropping them would put the row count at odds with the header
  // and leave no way to reach them at all; the Status column is what keeps them
  // from being mailed as though they were confirmed.
  //
  // A member with no address is skipped instead: `User.email` is optional and
  // defaults to empty, and a blank address is a row a mailing tool rejects. The
  // page reports how many were left out so a short file is not a silent one.
  const rows = h.members
    .filter((m) => m.user !== undefined && m.user.email !== "")
    .map((m) => [
      m.user!.email,
      m.user!.displayName || m.user!.username,
      m.isWaiting ? "Waitlisted" : "Approved",
      m.role === HackathonRole.HACKATHON_ROLE_OWNER ? "Owner" : "Member",
    ])

  const csv =
    csvRow(["Email Address", "Full Name", "Status", "Role"]) +
    rows.map(csvRow).join("")

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slugify(h.name)}-participants.csv"`,
      // The roster changes with every approval and removal; a cached copy of the
      // one from before them is worse than a second round trip.
      "Cache-Control": "no-store",
    },
  })
}
