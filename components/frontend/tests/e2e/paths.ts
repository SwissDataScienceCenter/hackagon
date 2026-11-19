import path from "node:path"

/** Where the browser tests write reports, traces and saved logins. */
export const outDir = path.resolve(
  import.meta.dirname,
  "../../../../.output/e2e",
)

/**
 * The logins from the dev Keycloak realm that the tests sign in as. What each
 * one can see is set by the seed — see components/backend/cmd/seed/README.md.
 */
export const users = ["alice", "bob"] as const
export type User = (typeof users)[number]

export const password = "aliceandbob"

/** The saved session of `user`, written by auth.setup.ts. */
export function storageState(user: User): string {
  return path.join(outDir, "auth", `${user}.json`)
}
