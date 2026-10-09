/**
 * "Find a person" on the team-assignment page: which names match what was
 * typed, which letters to mark, and stepping from one match to the next.
 *
 * Kept out of the page so it can be tested directly: the page only keeps the
 * query, draws the marks and scrolls.
 *
 * A search highlights and never hides — unlike the pool filters it does not
 * even reorder, so nobody moves while the organizer is looking for them.
 */

/** A piece of a name, marked when it is part of a match. */
export type NameSegment = { text: string; hit: boolean }

/**
 * Lower case without accents, so "jose" finds "José" and "JOSE".
 * Decomposing splits "é" into "e" plus a combining accent; dropping the
 * combining marks leaves the plain letter.
 */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}

/**
 * The name split into marked and unmarked pieces, or null when the query is
 * blank or not in the name. Matches anywhere in the name, ignoring case,
 * accents and the spaces around the query, and marks every occurrence.
 *
 * The name is folded one character at a time so each folded letter knows
 * which original characters it came from: folding can change the length
 * (an "é" written as "e" plus a combining accent folds to one letter), and
 * the marks belong on the name as written.
 */
export function nameSegments(
  name: string,
  query: string,
): NameSegment[] | null {
  const needle = fold(query.trim())
  if (needle === "") return null

  let folded = ""
  const starts: number[] = []
  const ends: number[] = []
  let at = 0
  for (const char of name) {
    const f = fold(char)
    // A lone combining accent folds to nothing; it belongs to the letter
    // before it, so a mark ending on that letter takes it in too.
    for (let i = ends.length - 1; f === "" && i >= 0 && ends[i] === at; i--) {
      ends[i] = at + char.length
    }
    folded += f
    for (let i = 0; i < f.length; i++) {
      starts.push(at)
      ends.push(at + char.length)
    }
    at += char.length
  }

  const ranges: [number, number][] = []
  for (
    let i = folded.indexOf(needle);
    i !== -1;
    i = folded.indexOf(needle, i + needle.length)
  ) {
    const start = starts[i]
    const end = ends[i + needle.length - 1]
    // Always set — `folded` and both maps grow together — but the compiler
    // cannot know that.
    if (start === undefined || end === undefined) continue
    const last = ranges[ranges.length - 1]
    // Two matches can end and start inside the same original character.
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else ranges.push([start, end])
  }
  if (ranges.length === 0) return null

  const segments: NameSegment[] = []
  let from = 0
  for (const [start, end] of ranges) {
    if (start > from)
      segments.push({ text: name.slice(from, start), hit: false })
    segments.push({ text: name.slice(start, end), hit: true })
    from = end
  }
  if (from < name.length) segments.push({ text: name.slice(from), hit: false })

  return segments
}

/**
 * The match one step forward (+1) or back (-1) from the current one, wrapping
 * at either end. With no current match — or one that is gone — forward starts
 * at the first match and back at the last. Null when nothing matches.
 */
export function stepMatch(
  ids: readonly string[],
  currentId: string | null,
  step: 1 | -1,
): string | null {
  const at = currentId === null ? -1 : ids.indexOf(currentId)
  const next =
    at === -1
      ? step === 1
        ? ids[0]
        : ids.at(-1)
      : ids[(at + step + ids.length) % ids.length]

  return next ?? null
}
