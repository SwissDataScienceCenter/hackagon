/**
 * The date line a hackathon shows wherever it is listed or introduced.
 *
 * Shared rather than formatted per route: the public list and the hackathon's
 * own page sit one click apart, and the same event written `24 – 25 Oct 2026`
 * in one place and `24/10/2026` in the other reads as two different events.
 *
 * `en-CH` gives day-first ordering with an English month name, matching the
 * rest of the app. Both dates are nullable in the schema, so an empty string is
 * a real answer — callers hide the line rather than print a placeholder.
 */
export function formatDateRange(h: { startsAt?: Date; endsAt?: Date }): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-CH", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  if (h.startsAt && h.endsAt) return `${fmt(h.startsAt)} – ${fmt(h.endsAt)}`
  if (h.startsAt) return `Starts ${fmt(h.startsAt)}`
  return ""
}
