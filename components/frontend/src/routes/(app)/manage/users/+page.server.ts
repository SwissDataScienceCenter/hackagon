import type { PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { error } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// Read-only. Changing a user's platform role happens on their own page,
// `/manage/users/[id]`, where the choice sits beside what each role carries.
export const load: PageServerLoad = async (event) => {
  const { user, hackathon } = requireGrpc(event.locals.grpc)

  // The sidebar only offers this page to a global admin, but the URL is
  // guessable and `UserService.List` requires user:read — which only admin
  // holds. Translate that denial rather than letting it surface as a 500.
  try {
    // One more call for every hackathon with its owners: `List` fills
    // `owners` in for any hackathon the caller may read, which for an admin is
    // all of them, private included. Checked against the running server — the
    // proto comment still says Get only.
    //
    // TODO(backend: user-hackathon-summary): participation is not counted.
    // Each hackathon's participants only come with `Get`, which also loads its
    // tracks, projects and pages — one heavy call per hackathon, or a `List` per
    // user, either way growing with the platform. Wants a per-user summary on
    // `UserService.List`; until then the user's own page shows it.
    const [users, hackathons] = await Promise.all([
      user.list({}),
      hackathon.list({}),
    ])

    const owned = new Map<string, number>()
    for (const h of hackathons.hackathons) {
      for (const o of h.owners) owned.set(o.id, (owned.get(o.id) ?? 0) + 1)
    }

    return {
      users: users.users.map((u) => ({
        ...u,
        ownedCount: owned.get(u.id) ?? 0,
      })),
    }
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You don't have permission to view the user list")
    }
    throw e
  }
}
