import { error, redirect } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import {
  createAuthorizedGrpc,
  publicHackathonClient,
  publicPageClient,
} from "$lib/server/grpc/client"
import { Visibility } from "$lib/server/grpc/generated/hackathon/entities/visibility"
import { ClientError, Status } from "nice-grpc-common"
// Importing the type also pulls in the module augmentation that puts
// accessToken on Session — the same thing hooks.server.ts relies on.
import type { CustomSession } from "../../../../auth.d"

export const load: PageServerLoad = async (event) => {
  const session = (await event.locals.auth()) as CustomSession | null

  // Members belong in the member view. Previously EVERY signed-in visitor was
  // redirected there, so non-members landed on a bare 403 with no way forward
  // (audit F1). Ask the backend first and only redirect people who can
  // actually get in.
  if (session?.accessToken) {
    try {
      const grpc = createAuthorizedGrpc(session.accessToken)
      await grpc.hackathon.get({ hackathonId: event.params.id })
      redirect(302, `/my/hackathon/${event.params.id}/overview`)
    } catch (e) {
      // A redirect is thrown, so let it through untouched.
      if (e instanceof Response || (e as { status?: number })?.status) throw e
      const denied =
        e instanceof ClientError &&
        (e.code === Status.PERMISSION_DENIED || e.code === Status.NOT_FOUND)
      if (!denied) throw e
      // Not a member: fall through and treat them like any other visitor.
    }
  }

  // `Get` requires membership (audit B2), so the public page is built from
  // `List`, which serves public hackathons to anonymous callers.
  const listed = await publicHackathonClient().list({
    visibilityFilter: Visibility.VISIBILITY_PUBLIC,
  })
  const hackathon = listed.hackathons.find((h) => h.id === event.params.id)

  if (!hackathon) {
    // Private and nonexistent are deliberately indistinguishable: anything
    // else lets someone probe UUIDs to discover private events. Anonymous
    // visitors get a plain 404; a signed-in visitor gets the explanation
    // page below, which tells an invitee what to do without confirming
    // anything about this id.
    if (!session?.user) error(404, "Hackathon not found")

    return { locked: true as const, hackathon: null, pages: [] }
  }

  let pages: { id: string; title: string; content: string }[] = []
  try {
    const result = await publicPageClient().list({ hackathonId: event.params.id })
    pages = result.pages.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content ?? "",
    }))
  } catch {
    // Page listing is best-effort — the event page still renders without it.
  }

  return {
    locked: false as const,
    hackathon: {
      id: hackathon.id,
      name: hackathon.name,
      description: hackathon.description ?? "",
      logo: hackathon.logo ?? "",
      status: hackathon.status,
      startsAt: hackathon.startsAt,
      endsAt: hackathon.endsAt,
    },
    pages,
  }
}
