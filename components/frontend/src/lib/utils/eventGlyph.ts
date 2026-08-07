/**
 * A picture for an event that has no picture.
 *
 * List rows used to show a flat gradient square, which reads as a missing
 * image rather than as a deliberate placeholder — every event looked like it
 * had failed to load something. A glyph is chosen from the event's own name,
 * so it is stable across renders and reloads (the same event always gets the
 * same mark) while a list of events gets a varied one.
 *
 * Deliberately NOT random and not sequential: random changes on every render,
 * and index-based changes the moment the sort order does — so an event people
 * recognise by its mark would silently swap marks when someone filtered the
 * list.
 */

// Emoji, because they need no asset, no network and no colour management, and
// they inherit the text colour context so they work in both themes. Chosen to
// read at 24px and to suggest research/hack subject matter rather than
// decoration.
const GLYPHS = [
  "🚀",
  "🔬",
  "🧬",
  "⚡",
  "🌍",
  "🤖",
  "📊",
  "🛰️",
  "🧪",
  "💡",
  "🗺️",
  "🔭",
  "⚙️",
  "🧠",
  "🌱",
  "🩺",
] as const

/**
 * FNV-1a, 32-bit. Any stable hash would do; this one is four lines and has no
 * dependency. `>>> 0` keeps it unsigned — without it the modulo of a negative
 * hash returns a negative index and the lookup is undefined.
 */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** A stable emoji for an event, derived from its name. */
export function eventGlyph(name: string): string {
  if (!name) return GLYPHS[0]
  return GLYPHS[hash(name) % GLYPHS.length]!
}

/** Every glyph, for a picker or a style guide. */
export const EVENT_GLYPHS: readonly string[] = GLYPHS
