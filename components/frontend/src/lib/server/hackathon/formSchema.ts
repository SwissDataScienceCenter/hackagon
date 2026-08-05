// Parsing the organiser's form builder back into a schema.
//
// The builder posts parallel arrays (`fieldKey[]`, `fieldLabel[]`, …) rather
// than JSON, so the form still works without JavaScript and a half-filled row
// is recoverable instead of being a parse error.
//
// Server-only: it is the write path for ConfigService.SetRegistrationForm and
// SetSubmissionForm, both of which REPLACE the whole schema — the builder
// therefore always submits every row, and a row missing from the post is a row
// the organiser deleted.

export interface SchemaField {
  key: string
  label: string
  type: string
  required: boolean
  maxMb?: number
}

export interface SchemaConsent {
  key: string
  label: string
  required: boolean
}

/** Field types the builder offers. `file-or-url` accepts a link today. */
export const FIELD_TYPES = ["text", "textarea", "url", "email", "tags", "file-or-url"] as const

export function formFieldRows(form: FormData): SchemaField[] {
  const keys = form.getAll("fieldKey")
  const labels = form.getAll("fieldLabel")
  const types = form.getAll("fieldType")
  const required = form.getAll("fieldRequired")
  const maxMb = form.getAll("fieldMaxMb")

  const fields: SchemaField[] = []
  for (let i = 0; i < keys.length; i++) {
    const key = String(keys[i] ?? "").trim()
    // An empty key is an empty row the organiser left behind, not an error.
    if (!key) continue

    const mb = Number(maxMb[i] ?? 0)
    fields.push({
      key,
      // Falling back to the key keeps a half-filled row usable rather than
      // rendering a question with no question.
      label: String(labels[i] ?? "").trim() || key,
      type: String(types[i] ?? "").trim() || "text",
      required: String(required[i] ?? "") === "true",
      ...(Number.isFinite(mb) && mb > 0 ? { maxMb: mb } : {}),
    })
  }

  return fields
}

export function consentRows(form: FormData): SchemaConsent[] {
  const keys = form.getAll("consentKey")
  const labels = form.getAll("consentLabel")
  const required = form.getAll("consentRequired")

  const consents: SchemaConsent[] = []
  for (let i = 0; i < keys.length; i++) {
    const key = String(keys[i] ?? "").trim()
    if (!key) continue
    consents.push({
      key,
      label: String(labels[i] ?? "").trim() || key,
      required: String(required[i] ?? "") === "true",
    })
  }

  return consents
}

/**
 * The first key that appears twice, or null.
 *
 * Keys address the answers, so two rows sharing one means the second silently
 * overwrites the first — every registrant's answer to the first question would
 * vanish, and nothing in the UI would say so.
 */
export function duplicateKey(keys: string[]): string | null {
  const seen = new Set<string>()
  for (const k of keys) {
    if (seen.has(k)) return k
    seen.add(k)
  }

  return null
}
