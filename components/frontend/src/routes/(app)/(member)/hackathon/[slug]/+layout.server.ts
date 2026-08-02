import type { LayoutServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { readCapabilities } from "$lib/utils/capabilities"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: LayoutServerLoad = async (event) => {
  const { hackathon, team } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  let result
  try {
    result = await hackathon.get({ hackathonId: event.params.slug })
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You are not a confirmed member of this hackathon")
    }
    if (e instanceof ClientError && e.code === Status.NOT_FOUND) {
      error(404, "Hackathon not found")
    }
    throw e
  }

  if (!result.hackathon) {
    error(404, "Hackathon not found")
  }

  const myMembership =
    result.hackathon.members.find((m) => m.user?.id === platformUserId) ?? null

  // Which team(s) the viewer is on, surfaced as a header chip on every member
  // page. There is no "my team" RPC, so this means listing and filtering. It is
  // decorative, so a failure degrades to no chip rather than breaking every
  // page nested under this layout.
  let myTeams: { id: string; name: string }[] = []
  try {
    const { teams } = await team.list({ hackathonId: event.params.slug })
    myTeams = teams
      .filter((t) => t.members.some((m) => m.id === platformUserId))
      .map((t) => ({ id: t.id, name: t.name }))
  } catch {
    myTeams = []
  }

  // Every page under this layout gets the same answer to "what is open right
  // now". Layout data is the shared accessor — no store needed — so no page has
  // to re-derive it and none can disagree with another.
  //
  // The server resolved these at request time, so a page left open across a
  // deadline goes stale until the next navigation. Same property `status`
  // already has.
  const capabilities = readCapabilities(result.hackathon.capabilities)

  return { hackathon: result.hackathon, myMembership, myTeams, capabilities }
}
