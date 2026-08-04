/**
 * TODO(backend: user-profile-fields): placeholder profile copy.
 *
 * `user.entities.User` carries only id, username, keycloakId, displayName,
 * email and casbin roles — there is no affiliation, no bio and no link field in
 * `db/schema/user.go` or `user.proto`, and `UserService` has no write RPC at
 * all. Until those land, the profile UI reads its extra fields from here so the
 * layout can be reviewed against realistic copy.
 *
 * Deleting this file is the entire cleanup: swap `mockUserProfile(username)` for
 * the real fields on `User` at its four call sites (sidebar panel, profile page,
 * people page, participants list) and the mock is gone.
 *
 * Keyed by username, not id: `cmd/seed/main.go` assigns fresh UUIDs on every
 * `just refresh`, but the usernames are stable. Anyone not listed here — a real
 * Keycloak account — gets `undefined` rather than borrowed copy, so the UI never
 * attributes invented details to an actual person.
 */

export interface MockUserProfile {
  /** Where they work or study — one short line, shown next to the name. */
  affiliation?: string
  /** Job title. Distinct from a casbin role, which is a platform permission. */
  title?: string
  /** Free-text markdown bio. Skills live in here as prose, by design. */
  description?: string
  linkedinUrl?: string
}

// No avatarUrl anywhere on purpose: a remote image is one more thing to fail in
// a screenshot, and every avatar slot already falls back to initials.
const PROFILES: Record<string, MockUserProfile> = {
  "hackagon-admin": {
    affiliation: "Swiss Data Science Center",
    title: "Platform Administrator",
    description: `Keeps the lights on. I look after the Hackagon deployment
itself — Keycloak realms, database migrations and the odd 3am pager.

**Skills:** Kubernetes, Postgres, Go, Terraform, incident response.

If something on the platform is broken, I'm the one to ping.`,
  },
  alice: {
    affiliation: "ETH Zürich · Institute for Machine Learning",
    title: "Research Engineer",
    description: `I organise hackathons here and occasionally sneak onto a team
when nobody is watching. My day job is making research code survive contact
with real data.

**Skills:** Python, PyTorch, data pipelines, MLOps, technical writing.

Happy to pair on anything involving model evaluation — or to review your
submission README before you hand it in.`,
    linkedinUrl: "https://www.linkedin.com/in/example-alice",
  },
  bob: {
    affiliation: "EPFL · Computational Biology",
    title: "PhD Candidate",
    description: `Second-year PhD student working on protein structure
prediction. First hackathon was a disaster and I've been hooked ever since.

**Skills:** R, Python, statistics, bioinformatics, making very dense slides.

Looking for teammates who enjoy frontend work — I can handle the science, but
someone needs to stop me designing the UI.`,
  },
  charles: {
    affiliation: "Independent",
    title: "Frontend Developer",
    description: `Freelance developer, mostly TypeScript. I turn up to
hackathons for the excuse to build something end to end in 48 hours.

**Skills:** TypeScript, Svelte, CSS, accessibility, design systems.

I'm the person Bob is looking for.`,
    linkedinUrl: "https://www.linkedin.com/in/example-charles",
  },
}

/**
 * Placeholder profile for a username, or `undefined` for anyone unseeded.
 *
 * Callers must treat `undefined` as "no profile yet" and omit those lines rather
 * than substituting anything — which is also exactly how the real fields will
 * behave once they exist and are still blank.
 */
export function mockUserProfile(
  username: string | undefined,
): MockUserProfile | undefined {
  if (!username) return undefined

  return PROFILES[username]
}
