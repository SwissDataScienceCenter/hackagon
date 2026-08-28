import type { LayoutServerLoad } from "./$types"
import { env } from "$env/dynamic/private"

export const load: LayoutServerLoad = async (event) => {
  // Both halves, for every route: the shells in (public) and (app) render the
  // same NavBar, and it needs to tell an anonymous visitor from one whose
  // session died. See `$lib/server/session`.
  return {
    session: event.locals.session,
    sessionExpired: event.locals.sessionExpired ?? false,
    // The commit the running image was built from, baked into the image by
    // `components/frontend/tools/nix/pkgs/service-image`. Read at runtime, not
    // compiled in: the Nix build has no git history to stamp, and reading it
    // here keeps the pnpm/vite derivation cache-stable across commits. Absent
    // in dev, where the build-time stamp already carries the commit.
    buildCommit: env.HACKAGON_BUILD_COMMIT ?? null,
  }
}
