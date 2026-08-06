import { methodFromSlug, type MethodSlug } from "./voting"

/**
 * Server-only. Shared by the create and edit actions so the two can never
 * disagree about what a valid category is — the edit form posts the same fields
 * as the create form, and a rule enforced in one place only is a rule that
 * drifts.
 */

export interface ParsedCategory {
  name: string
  description: string
  method: MethodSlug
  /**
   * Undefined for single choice rather than 0: the field is `optional int32`
   * with a `gte = 1` constraint, so sending 0 fails buf.validate before the
   * handler is reached, while omitting it is exactly what "not a points
   * category" means on the wire.
   */
  maxPoints: number | undefined
}

const MAX_POINTS_CEILING = 1000

/**
 * Validate a submitted category form.
 *
 * Returns either the parsed values or a single message to hand to `fail(400)` —
 * the same shape both actions already use, so neither needs to know which rule
 * tripped. Every rule here is one the backend also enforces; this exists to
 * report them in the form rather than as a bare INVALID_ARGUMENT.
 */
export function readCategoryForm(
  form: FormData,
): ParsedCategory | { message: string } {
  const name = form.get("name")
  const description = form.get("description")
  const method = form.get("votingMethod")

  if (typeof name !== "string" || name.trim().length < 3) {
    return { message: "Name must be at least 3 characters" }
  }
  if (name.trim().length > 255) {
    return { message: "Name must be at most 255 characters" }
  }
  if (typeof method !== "string" || methodFromSlug(method) === undefined) {
    return { message: "Pick how people vote in this category" }
  }

  // Description is optional on the wire (no min_len), so an empty one is a
  // valid category rather than an error — unlike a track, where it is required.
  const desc = typeof description === "string" ? description.trim() : ""
  if (desc.length > 10000) {
    return { message: "Description must be at most 10000 characters" }
  }

  let maxPoints: number | undefined
  if (method === "points") {
    const raw = form.get("maxPoints")
    const parsed = typeof raw === "string" ? Number(raw) : NaN
    if (!Number.isInteger(parsed) || parsed < 1) {
      return {
        message: "Points per voter must be a whole number of at least 1",
      }
    }
    if (parsed > MAX_POINTS_CEILING) {
      return {
        message: `Points per voter must be at most ${MAX_POINTS_CEILING}`,
      }
    }
    maxPoints = parsed
  }

  return {
    name: name.trim(),
    description: desc,
    method: method as MethodSlug,
    maxPoints,
  }
}
