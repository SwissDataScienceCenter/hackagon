import type { LayoutServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManagePhases } from "$lib/server/hackathon/capabilities"
import { enabledCapabilities } from "$lib/server/hackathon/phaseForm"
import { currentAndNextPhase, unmetPhaseCapabilities } from "$lib/utils/phase"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: LayoutServerLoad = async (event) => {
  const { hackathon, page } = requireGrpc(event.locals.grpc)
  const platformUserId = event.locals.platformUser?.id

  let result
  try {
    result = await hackathon.get({ hackathonId: event.params.id })
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

  // The sidebar lists this hackathon's content pages. A separate PageService.List
  // rather than reading result.hackathon.pages: List is the authoritative source
  // for what a viewer may see, while hackathon.get hands hidden pages to plain
  // members too.
  //
  // `visible` is carried through rather than assumed: List only filters
  // `visible: false` out for callers *without* `page:write`
  // (`page_service.go:31`), so an organiser's list mixes hidden pages in with
  // published ones and the sidebar has to be able to tell them apart. For a
  // participant every entry here is visible by construction.
  //
  // A failure here degrades the nav to its fixed entries rather than failing this
  // load and blanking the hackathon — the content area is the part that has to
  // report a real error, and hackathon.get above already did if there was one.
  let hackathonPages: { id: string; title: string; visible: boolean }[] = []
  try {
    const { pages } = await page.list({ hackathonId: event.params.id })
    hackathonPages = pages.map((p) => ({
      id: p.id,
      title: p.title,
      visible: p.visible,
    }))
  } catch (err) {
    event.locals.logger.warn(
      { err },
      "LAYOUT: page list failed, rendering the hackathon nav without content pages",
    )
  }

  // Resolved here rather than in the sidebar because `enabledCapabilities` reads
  // generated types and is server-only. It decides whether the participant
  // Voting entry is in the nav at all — see `memberNav`.
  const caps = enabledCapabilities(result.hackathon.state)
  const votingEnabled = caps.includes(Capability.CAPABILITY_VOTE)
  // Its own switch, not implied by voting — an organiser closes voting, checks
  // the tally, then publishes.
  const resultsVisible = caps.includes(Capability.CAPABILITY_VIEW_RESULTS)

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )

  // Computed once for the whole subtree rather than per page: the overview's
  // state card, the layout's organiser banner and the sidebar's Manage Timeline
  // badge all read it, and three surfaces deriving "is anything misconfigured"
  // separately is three chances for them to disagree.
  //
  // `currentPhaseId` is the empty string when nothing is declared, which
  // `currentAndNextPhase` reads as "fall back to the dates" — the same
  // precedence `resolvePhaseStatus` applies on the timeline.
  const currentPhaseId = result.hackathon.state?.currentPhaseId ?? ""
  const { current, next, declared } = currentAndNextPhase(
    result.hackathon.phases,
    currentPhaseId || undefined,
  )

  const hackathonState = {
    enabled: caps,
    // No state row means `SetCapabilities` answers NotFound and nothing can be
    // switched on at all — a data gap rather than a configuration, and the one
    // thing worth telling an organiser before anything else.
    hasState: result.hackathon.state !== undefined,
    // Whether "now" is an organiser's declaration or just the calendar. The card
    // labels the two differently; nothing else depends on it.
    declared,
    currentPhase: current
      ? {
          id: current.id,
          name: current.name,
          description: current.description ?? "",
          startsAt: current.startsAt,
          endsAt: current.endsAt,
          capabilities: current.capabilities as number[],
        }
      : null,
    nextPhase: next
      ? {
          id: next.id,
          name: next.name,
          startsAt: next.startsAt,
          endsAt: next.endsAt,
        }
      : null,
    // Only ever computed against the *current* phase. A future phase planning a
    // capability that is off is not a problem — it is simply not time yet.
    unmet: unmetPhaseCapabilities(
      (current?.capabilities as number[] | undefined) ?? [],
      caps,
    ),
    // Owner-or-admin, the same gate `manageNav` and the manage routes apply.
    // Decides who sees the banner and the organiser voice on the card; it offers
    // no action of its own, so nothing here needs the backend to agree.
    canManage: mayManagePhases(myMembership ?? undefined, isAdmin),
  }

  return {
    hackathon: result.hackathon,
    myMembership,
    hackathonPages,
    votingEnabled,
    resultsVisible,
    hackathonState,
  }
}
