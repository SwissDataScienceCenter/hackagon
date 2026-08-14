/**
 * Registration answers, as an organiser reads them.
 *
 * `fields`/`consents` are described structurally rather than by the generated
 * `FormField`/`ConsentField` types: this module lives outside `$lib/server/`, so
 * it must not import them.
 */

/**
 * One answer, as a string an organiser can read and a filter can match.
 *
 * Registration answers arrive as a protobuf Struct, so a value is whatever the
 * organiser's field type produced — text, a number, a checkbox, a multi-select.
 * Rendering the raw JSON would put `["a","b"]` on screen.
 */
export function formatAnswer(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (Array.isArray(value))
    return value.map(formatAnswer).filter(Boolean).join(", ")
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "object") return JSON.stringify(value)

  return String(value).trim()
}

/** Where `key` sits in the organiser's schema; after everything it defines. */
function schemaOrder(
  fields: readonly { key: string }[],
): (key: string) => number {
  const positions = new Map(fields.map((f, i) => [f.key, i]))

  return (key) => positions.get(key) ?? fields.length
}

/**
 * A stored form as labelled pairs, in the order the questions were asked.
 *
 * The Struct's own key order is whatever the wire produced, which is not the
 * order anyone wrote the form in. A stored key the schema no longer defines
 * keeps its raw key as a label and sorts last, so a question that was removed
 * still reads as something rather than vanishing. Empty answers are dropped —
 * an unanswered optional field is not a line worth printing.
 */
export function labelledAnswers(
  responses: { [key: string]: unknown } | undefined,
  fields: readonly { key: string; label: string }[],
): { label: string; value: string }[] {
  const order = schemaOrder(fields)

  return Object.entries(responses ?? {})
    .sort(([a], [b]) => order(a) - order(b))
    .map(([key, value]) => ({
      label: fields.find((f) => f.key === key)?.label ?? key,
      value: formatAnswer(value),
    }))
    .filter((a) => a.value !== "")
}

/**
 * The consents on file, in schema order.
 *
 * Nothing is filtered here, unlike the answers: a consent that was NOT given is
 * exactly what an organiser opens this to check, so a missing row and a "No" row
 * must not look the same.
 */
export function labelledConsents(
  consents: { [key: string]: boolean } | undefined,
  fields: readonly { key: string; label: string }[],
): { label: string; given: boolean }[] {
  const order = schemaOrder(fields)

  return Object.entries(consents ?? {})
    .sort(([a], [b]) => order(a) - order(b))
    .map(([key, given]) => ({
      label: fields.find((f) => f.key === key)?.label ?? key,
      given,
    }))
}
