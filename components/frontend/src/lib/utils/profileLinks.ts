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
 * The shape of a profile address on each site, as far as deciding whether to
 * offer one is concerned: the host, and a path that is a person rather than a
 * repository or a post. Which characters a username may hold is left to
 * `UserService.Edit`, which refuses what does not fit and names it.
 */
const PROFILE_URL_SHAPES: Record<
  ProfileLinkKey,
  { host: RegExp; path: RegExp }
> = {
  github: { host: /^(www\.)?github\.com$/, path: /^\/[^/]+\/?$/ },
  linkedin: {
    host: /^([a-z]{2,3}\.)?linkedin\.com$/,
    path: /^\/in\/[^/]+\/?$/,
  },
  renku: { host: /^(www\.)?renkulab\.io$/, path: /^\/u\/[^/]+\/?$/ },
}

/** Which kind of profile address `href` is, if any. */
export function profileLinkKindOf(href: string): ProfileLinkKey | undefined {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return undefined
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined
  const host = url.hostname.toLowerCase()
  return (Object.keys(PROFILE_URL_SHAPES) as ProfileLinkKey[]).find(
    (key) =>
      PROFILE_URL_SHAPES[key].host.test(host) &&
      PROFILE_URL_SHAPES[key].path.test(url.pathname),
  )
}

/**
 * The first address among `hrefs` that could fill one of the person's empty
 * profile links, e.g. a GitHub URL typed into a registration answer before
 * profile links existed. A kind already set is never suggested: replacing a
 * saved link is the Account page's job, where the person sees what they lose.
 */
export function profileLinkSuggestion(
  hrefs: readonly string[],
  links: ProfileLinks,
): { key: ProfileLinkKey; url: string } | undefined {
  for (const url of hrefs) {
    const key = profileLinkKindOf(url)
    if (key && links[key] === "") return { key, url }
  }
  return undefined
}

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
