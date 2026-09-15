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

  try {
    const { hackathons } = await hackathon.list({})

    return { hackathons }
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You don't have permission to list every hackathon")
    }
    throw e
  }
}
