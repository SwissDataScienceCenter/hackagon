import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayViewResults } from "$lib/server/hackathon/capabilities"
import { enabledCapabilities } from "$lib/server/hackathon/phaseForm"
import {
  ballotSubmissions,
  categoryView,
  resultView,
  sortResults,
  submissionLookup,
} from "$lib/server/hackathon/voting"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { vote, team } = requireGrpc(event.locals.grpc)

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  const resultsVisible = enabledCapabilities(hackathon.state).includes(
    Capability.CAPABILITY_VIEW_RESULTS,
  )

  // Not a 403, same reasoning as the booth: results being unpublished is a
  // normal state of a hackathon, not a permission the viewer got wrong.
  if (!mayViewResults(myMembership ?? undefined, resultsVisible, isAdmin)) {
    return {
      hackathonId: event.params.id,
      resultsVisible,
      canView: false,
      categories: [],
      entries: [],
    }
  }

  const submissions = await ballotSubmissions(
    team,
    event.params.id,
    new Map(hackathon.projects.map((p) => [p.id, p.title])),
    event.locals.platformUser?.id,
  )
  const byId = submissionLookup(submissions)

  // Every category, including ranked ones the booth cannot cast a vote for —
  // results are results however they were produced, and a category tallied
  // elsewhere still deserves to show its podium.
  //
  // Jury categories are *not* filtered here, unlike in the booth. Reading a
  // result needs `vote_result:read`, which the capability grants to every
  // member; only *casting* is restricted to the jury. Hiding a jury category's
  // results from non-jury members would withhold what the backend is willing to
  // show, and a jury prize is exactly the kind everyone wants to see.
  const { voteCategories } = await vote.listVoteCategories({
    hackathonId: event.params.id,
  })

  const categories = await Promise.all(
    voteCategories.map(async (c) => {
      const view = categoryView(c)
      try {
        const { voteResults } = await vote.listVoteResults({ categoryId: c.id })

        return {
          ...view,
          results: sortResults(voteResults.map((r) => resultView(r, byId))),
        }
      } catch (e) {
        // One category's results failing should not blank the whole page — the
        // others are still worth showing.
        if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
          return { ...view, results: [] }
        }
        throw e
      }
    }),
  )

  return {
    hackathonId: event.params.id,
    resultsVisible,
    canView: true,
    // A category nobody has placed anything in has no podium to show, and a
    // page listing three empty headings reads as broken rather than pending.
    categories: categories.filter((c) => c.results.length > 0),
    // Every team's entry, placed or not, each linking to its own page. This is
    // the directory the deleted all-submissions list used to be: the ballot only
    // ever showed entries you may vote for, and only while voting was open, so
    // without this a team that placed nowhere — or the viewer's own team — has no
    // page anyone can reach. Placed entries appear here too rather than being
    // filtered out: a placement is per category, and hiding a team from the
    // directory because it won something else reads as an omission.
    //
    // Sorted by project title, since there is no placement to order these by.
    entries: [...submissions].sort((a, b) =>
      a.projectTitle.localeCompare(b.projectTitle),
    ),
  }
}
