/**
 * Which of a hackathon's content pages read as a gallery, and which read as a
 * session line-up.
 *
 * There is no photo entity and no webinar entity — media is links-first until
 * object storage lands (docs/roadmap.md), and a speaker schedule would be
 * invented rather than modelled. What organisers actually do is publish a page
 * ("Photos & Winners", "Pre-event webinars"), so the two collection views read
 * the real pages and group them by title.
 *
 * The hints live here rather than in either route because `navigation.ts` asks
 * the same question the loaders do: a collection view with nothing to collect
 * gets no nav entry, so the tab appears the day the page does and never sits
 * there as a permanent duplicate of the page list below it.
 *
 * Client-safe on purpose — components import `navigation.ts`, and
 * `$lib/server/**` is server-only.
 *
 * Note there is no `g` flag: a global regex carries `lastIndex` between calls,
 * so `.test()` over a list would skip every other match.
 */
export const PHOTO_HINT = /photo|gallery|album|picture|snapshot|impression/i

export const SESSION_HINT =
  /webinar|session|talk|recording|livestream|stream|workshop|kick-?off/i

/** Whether any page's title reads like one of this collection. */
export function collects(
  hint: RegExp,
  pages: { title: string }[] = [],
): boolean {
  return pages.some((p) => hint.test(p.title))
}
