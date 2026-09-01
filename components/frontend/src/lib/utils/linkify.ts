// A registration answer is free text, and the commonest useful thing somebody
// puts in one is an address — their repo, their portfolio, the paper they want
// to work from. Until now every reader had to select it and copy it by hand.
//
// This splits an answer into the runs that are addresses and the runs that are
// not, so a component can render the first as anchors and leave the rest as
// text. It deliberately produces *segments* rather than HTML: nothing here can
// end up inside `{@html}`, so an answer can never carry markup onto the page.
// That is the whole reason it is not routed through the markdown pipeline in
// `./markdown`, which is for text an organizer wrote knowing it was markdown.

import { isHttpUrl } from "./url"

export type AnswerSegment =
  | { kind: "text"; value: string }
  /** `href` is also the visible text: see `linkify` on why they never differ. */
  | { kind: "link"; href: string }

/**
 * A run that might be an address. Only the two schemes that can be followed
 * safely are recognised at all, which is what keeps a `javascript:` or `data:`
 * string from ever reaching an `href` — it is not that such a string is
 * rejected later, it is that it is never a candidate.
 *
 * Angle brackets and quotes end the run because they are how somebody encloses
 * a URL rather than part of one.
 */
const URL_CANDIDATE = /https?:\/\/[^\s<>"'`]+/g

/** Punctuation that ends the sentence rather than the address. */
const SENTENCE_ENDINGS = ".,;:!?'\""

/** A closer only belongs to the URL if the URL opened it. */
const CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{" }

const occurrences = (text: string, char: string): number => {
  let n = 0
  for (const c of text) if (c === char) n++
  return n
}

/**
 * Gives back the trailing characters that belong to the sentence.
 *
 * `see https://x.dev/a.` should not link the full stop, and
 * `(https://en.wikipedia.org/wiki/Foo_(bar))` should keep its inner parens and
 * drop only the outer one — hence counting the pair rather than stripping every
 * closer. Repeats until nothing more comes off, so `(https://x.dev/a).` loses
 * both.
 */
function trimSentence(candidate: string): string {
  let url = candidate

  for (;;) {
    const last = url.at(-1)
    if (last === undefined) return url

    if (SENTENCE_ENDINGS.includes(last)) {
      url = url.slice(0, -1)
      continue
    }

    const opener = CLOSERS[last]
    if (opener && occurrences(url, last) > occurrences(url, opener)) {
      url = url.slice(0, -1)
      continue
    }

    return url
  }
}

/**
 * One answer, split into the parts that are addresses and the parts that are
 * not. Text with no address in it comes back as a single text segment, which is
 * the common case and renders exactly as it did before this existed.
 *
 * A link segment carries only its `href`, because the address as typed is also
 * what is shown. That is not laziness: it means an answer cannot display one
 * host while pointing at another, which is the trick a linkifier that accepted
 * a label would hand to anybody filling in a form.
 */
export function linkify(text: string): AnswerSegment[] {
  const segments: AnswerSegment[] = []
  let cursor = 0

  URL_CANDIDATE.lastIndex = 0
  for (let match = URL_CANDIDATE.exec(text); match; ) {
    const href = trimSentence(match[0])

    // `https://` with nothing after it, or a run that trimmed down to one.
    // Left as the text it is, and the scan resumes after it.
    if (!isHttpUrl(href)) {
      match = URL_CANDIDATE.exec(text)
      continue
    }

    const before = text.slice(cursor, match.index)
    if (before) segments.push({ kind: "text", value: before })
    segments.push({ kind: "link", href })

    // Past the address but not past the punctuation that followed it — that is
    // still text somebody wrote, and the next address may be inside it.
    cursor = match.index + href.length
    URL_CANDIDATE.lastIndex = cursor
    match = URL_CANDIDATE.exec(text)
  }

  const rest = text.slice(cursor)
  if (rest) segments.push({ kind: "text", value: rest })

  return segments
}
