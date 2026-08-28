/**
 * The running build's version, as shown in the footer.
 *
 * Stamped at build time by `vite.config.ts` from `VERSION` at the repo root —
 * the single source of truth, bumped via `just version::bump`. A release build
 * reads `v0.0.1`; any other build carries the commit it came from
 * (`v0.0.1+4b87857`) and a `-dirty` suffix for uncommitted changes, so a
 * screenshot in a bug report identifies the code that produced it.
 *
 * Safe to import from a `.svelte` file — this is not under `$lib/server/`.
 */

/**
 * `typeof` rather than a bare read: the identifier only exists because Vite
 * textually substitutes it, and a consumer configured without that `define`
 * would otherwise throw a ReferenceError at module load instead of degrading.
 */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "v0.0.0"

/** A git object name: seven to forty lowercase hex digits. */
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/

/**
 * What the footer shows, given the commit the running image reports.
 *
 * A deployed image cannot stamp its own commit at build time — the Nix sandbox
 * builds from a fileset with no git history — so the image carries it as
 * `HACKAGON_BUILD_COMMIT` instead and the root layout load hands it down. That
 * value wins over `APP_VERSION`, which only knows what the build could see.
 *
 * In dev nothing sets the variable and `APP_VERSION` already carries the local
 * commit, so it stands unchanged.
 */
export function displayVersion(buildCommit?: string | null): string {
  const commit = buildCommit?.trim().toLowerCase()

  // Ignore anything that is not a commit hash rather than rendering it. The
  // value crosses a deployment boundary, and a footer showing a plausible but
  // wrong identifier is worse than one honestly limited to the build stamp.
  if (!commit || !COMMIT_PATTERN.test(commit)) return APP_VERSION

  // Keep the declared version, drop any build-time commit or `-dirty` suffix:
  // the runtime commit supersedes it.
  return `${APP_VERSION.split("+")[0]}+${commit}`
}
