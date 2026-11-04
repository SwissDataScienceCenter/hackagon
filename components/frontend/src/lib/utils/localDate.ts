/**
 * A date as `YYYY-MM-DD` in the reader's own calendar, or an em dash when there
 * is none.
 *
 * ISO-8601 rather than a locale format: fixed width, so a column of them lines
 * up under `.tnum`, and unambiguous about which number is the month. Assembled
 * from the local calendar fields because `toISOString()` converts to UTC first,
 * which lands on the previous day for anyone east of Greenwich.
 */
export function localIsoDate(d: Date | undefined): string {
  if (!d) return "—"
  const date = new Date(d)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}
