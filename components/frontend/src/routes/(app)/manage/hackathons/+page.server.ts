import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// Every hackathon on the platform, private ones included.
//
// The dashboard cannot show these. Its two lists are "hackathons you are in"
// (`participantId`/`ownerId`) and "public hackathons" — so a private hackathon an
// admin neither owns nor joined falls through both, and was unreachable from the
// UI even though casbin lets an admin do anything to it. This page is the way in.
//
// No filter at all on the call: `List` drops a private hackathon the caller
// cannot read (`hackathon_service.go:1554`), and an admin reads everything via
// the matcher's `g2(r.sub, "admin")`, so the same request returns the whole
// platform to an admin and nothing extra to anybody else.
export const load: PageServerLoad = async (event) => {
  const { hackathon } = requireGrpc(event.locals.grpc)

  // The sidebar offers this page to a global admin only, but the URL is
  // guessable — and `List` answers a non-admin with a *shorter list* rather than
  // a refusal, so without this they would get a page headed "every hackathon on
  // the platform" showing some of them. Nothing leaks either way; the page would
  // simply be lying about what it is. The role comes from the (app) layout,
  // which already read it off `platformUser`.
  const { isGlobalAdmin } = await event.parent()
  if (!isGlobalAdmin) {
    error(403, "You don't have permission to list every hackathon")
  }

  const { hackathons } = await hackathon.list({}).catch((e: unknown) => {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You don't have permission to list every hackathon")
    }
    throw e
  })

  // TODO(backend: list-owners): `List` leaves `owners` empty — only `Get` fills
  // it — so each row costs a `Get` of its own, the whole hackathon tree fetched
  // to read one edge of it. Until then the page makes one call per hackathon,
  // in parallel. Once `List` carries owners for a caller who may read them,
  // delete `ownersOf` and read `h.owners` straight off the list entry.
  const owners = await Promise.all(hackathons.map((h) => ownersOf(event, h.id)))

  // Only what the page draws. A `Get` carries every project, member and page
  // of the hackathon; none of it belongs in the page payload.
  return {
    hackathons: hackathons.map((h, i) => ({
      id: h.id,
      name: h.name,
      logo: h.logo,
      status: h.status,
      startsAt: h.startsAt,
      endsAt: h.endsAt,
      visibility: h.visibility,
      participantCount: h.participantCount,
      owners: owners[i],
    })),
  }
}

type Owner = { id: string; displayName: string; username: string }

/**
 * The hackathon's owners, or null when they could not be read.
 *
 * Null rather than a failed page: one hackathon deleted between `List` and its
 * `Get`, or one refusal, should cost that row its owners and nothing else. The
 * page says so on the row rather than showing an empty list, which would read
 * as a hackathon nobody runs.
 */
async function ownersOf(
  event: Parameters<PageServerLoad>[0],
  hackathonId: string,
): Promise<Owner[] | null> {
  const { hackathon } = requireGrpc(event.locals.grpc)
  try {
    const { hackathon: h } = await hackathon.get({ hackathonId })
    if (!h) return null

    return h.owners.map((o) => ({
      id: o.id,
      displayName: o.displayName,
      username: o.username,
    }))
  } catch (e) {
    event.locals.logger.warn(
      { err: e, hackathonId },
      "manage/hackathons: could not read owners",
    )

    return null
  }
}
