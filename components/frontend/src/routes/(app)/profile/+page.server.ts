import type { PageServerLoad } from "./$types"
import { error } from "@sveltejs/kit"
import { mockUserProfile } from "$lib/mocks/userProfiles"

export const load: PageServerLoad = async (event) => {
  // No RPC of its own: hooks.server.ts already put the viewer on locals via
  // WhoAmI, and that response carries the casbin global roles too. UserService.Get
  // would need the `user:read` permission that only admin holds, so it is not an
  // option here anyway — WhoAmI is how a non-admin reads their own record.
  const me = event.locals.platformUser
  if (!me) {
    // The sidebar degrades to an empty nav when WhoAmI fails; a profile page has
    // nothing left to render, so it says so rather than showing blank fields.
    error(
      503,
      "Your profile is unavailable right now. Please try again shortly.",
    )
  }

  // TODO(backend: user-profile-fields): affiliation, title, description and
  // linkedinUrl are placeholders keyed by username — see $lib/mocks/userProfiles.
  // Replace this spread with the real fields on `me` once they exist on User.
  const mock = mockUserProfile(me.username)

  return {
    profile: {
      id: me.id,
      username: me.username,
      displayName: me.displayName,
      email: me.email,
      roles: me.roles,
      createdAt: me.createdAt,
      affiliation: mock?.affiliation ?? "",
      title: mock?.title ?? "",
      description: mock?.description ?? "",
      // Empty string rather than undefined: these four seed the edit form's
      // draft, and an input's value cannot be undefined.
      linkedinUrl: mock?.linkedinUrl ?? "",
    },
  }
}
