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

  // Every category, including ranked and jury ones the booth cannot cast a
  // vote for — results are results however they were produced, and a category
  // decided elsewhere (a jury meeting off the platform, say) still deserves to
  // show its podium. Listing categories takes `vote_category:read` *or*
  // `vote_result:read`, and the capability grants the latter to every member,
  // so this works after voting has closed.
  //
  // The catch is a guard, same as the per-category one below: a refusal here
  // once took the whole page down with a 500. Losing the podiums still leaves
  // the entries directory.
  let voteCategories: Awaited<
    ReturnType<typeof vote.listVoteCategories>
  >["voteCategories"] = []
  try {
    ;({ voteCategories } = await vote.listVoteCategories({
      hackathonId: event.params.id,
    }))
  } catch (e) {
    if (!(e instanceof ClientError && e.code === Status.PERMISSION_DENIED)) {
      throw e
    }
  }

  const categories = await Promise.all(
    voteCategories.map(async (c) => {
      const view = categoryView(c)
      try {
        const { voteResults } = await vote.listVoteResults({ categoryId: c.id })

        // Shaped for `ResultsList`, the layout the organizer checks them in.
        //
        // TODO(backend: result-score) — no score yet. A result stores only its
        // place; the organizer's page reads the score back from the votes, but
        // a participant may not list other people's votes (`ListVotes` needs
        // hackathon-wide `vote:read`). Once `VoteResult` carries the score
        // `SuggestResults` computed, pass it here as `score` — the list already
        // shows one when it is set.
        return {
          ...view,
          results: sortResults(voteResults.map((r) => resultView(r, byId))).map(
            (r) => ({
              key: r.id,
              place: r.position,
              projectTitle: r.projectTitle,
              teamName: r.teamName,
              teamId: r.teamId,
              title: r.title,
            }),
          ),
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
