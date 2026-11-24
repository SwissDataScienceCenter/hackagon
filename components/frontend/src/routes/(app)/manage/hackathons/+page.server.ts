import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error, fail } from "@sveltejs/kit"
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

  // `List` fills `owners` for every hackathon the caller may read, which for an
  // admin is all of them — so the owners arrive with the list, in one call.
  return {
    hackathons: hackathons.map((h) => ({
      id: h.id,
      name: h.name,
      logo: h.logo,
      status: h.status,
      startsAt: h.startsAt,
      endsAt: h.endsAt,
      visibility: h.visibility,
      participantCount: h.participantCount,
      // Only what a badge shows, not the whole user record.
      owners: h.owners.map((o) => ({
        id: o.id,
        displayName: o.displayName,
        username: o.username,
      })),
    })),
  }
}

export const actions: Actions = {
  // Soft delete: the backend sets `deleted_at` and keeps the data and roles,
  // but there is no Restore RPC yet, so from the app's side it is final.
  //
  // No admin check of its own: the backend decides who may delete (owners and
  // admins today). This page is where the button is offered, and the load above
  // already turns non-admins away from it.
  delete: async (event) => {
    const { hackathon } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()
    const hackathonId = form.get("hackathonId")
    // Only for the message: once deleted, the name can't be looked up again.
    const name = form.get("hackathonName")

    if (typeof hackathonId !== "string" || hackathonId === "") {
      return fail(400, { success: false, message: "No hackathon given" })
    }

    try {
      await hackathon.delete({ hackathonId })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
        return fail(403, {
          success: false,
          message: "You don't have permission to delete this hackathon",
        })
      }
      // Also what a second delete gets, e.g. from another admin's open tab.
      if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
        return fail(404, {
          success: false,
          message: "That hackathon no longer exists",
        })
      }
      throw e
    }

    // No redirect: the load re-runs and the row is simply gone.
    return {
      success: true,
      message:
        typeof name === "string" && name !== ""
          ? `Deleted “${name}”`
          : "Hackathon deleted",
    }
  },
}
