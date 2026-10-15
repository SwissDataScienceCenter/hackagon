/**
 * A person's profile links, as plain strings any component may take.
 *
 * Each is a full URL the backend rendered from a stored username — never the
 * text the user typed — so it is safe as an `href` as it stands: a fixed
 * `https://` prefix plus an escaped username. An empty string means not set; the
 * backend sends `""` rather than leaving the field out.
 */
export interface ProfileLinks {
  github: string
  linkedin: string
  renku: string
}

export type ProfileLinkKey = keyof ProfileLinks

/**
 * In display order. `example` is the shape the backend accepts, which is why
 * the form uses it as a placeholder rather than a generic "https://…".
 */
export const PROFILE_LINK_KINDS: readonly {
  key: ProfileLinkKey
  label: string
  example: string
}[] = [
  {
    key: "github",
    label: "GitHub",
    example: "https://github.com/your-username",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    example: "https://linkedin.com/in/your-name",
  },
  {
    key: "renku",
    label: "Renku",
    example: "https://renkulab.io/u/your-username",
  },
]
