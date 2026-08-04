import type { PageServerLoad } from "./$types"
import { error } from "@sveltejs/kit"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: hooks.server.ts already put the viewer on locals via
  // WhoAmI, and that response carries the casbin global roles too.
  // UserService.Get would need the `user:read` permission that only admin holds,
  // so it is not an option here anyway — WhoAmI is how a non-admin reads their
  // own record.
  const me = event.locals.platformUser
  if (!me) {
    // The sidebar degrades to an empty nav when WhoAmI fails; a profile page has
    // nothing left to render, so it says so rather than showing blank fields.
    error(
      503,
      "Your profile is unavailable right now. Please try again shortly.",
    )
  }

  // Everything returned here is a real field on `user.entities.User`. The
  // affiliation, job title, skills and bio this page was originally asked for
  // have no columns in db/schema/user.go and no proto fields, and UserService has
  // no Edit RPC to write them with — so nothing on this page is editable and
  // those fields are absent entirely rather than rendered blank.
  return {
    profile: {
      id: me.id,
      username: me.username,
      displayName: me.displayName,
      email: me.email,
      roles: me.roles,
      createdAt: me.createdAt,
    },
  }
}
