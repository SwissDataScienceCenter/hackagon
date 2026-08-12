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
