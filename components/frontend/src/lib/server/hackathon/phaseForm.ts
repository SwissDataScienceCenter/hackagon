import {
  Capability,
  capabilityFromJSON,
} from "$lib/server/grpc/generated/hackathon/entities/capability"
import type { HackathonState } from "$lib/server/grpc/generated/hackathon/entities/hackathon_state"

/**
 * Server-only: reads the generated `Capability` enum, so it must never be
 * imported by a component. The form's client-safe half — labels and
 * `datetime-local` formatting — is in `$lib/utils/phase`.
 */

/**
 * The capabilities a hackathon actually has switched on, as raw enum numbers.
 *
 * `HackathonState.capabilities` always carries all six with an `enabled` flag
 * rather than listing only the live ones (`stateEntryFromEnt`,
 * `mappers.go:319`), so this filters. A hackathon with no state row has no
 * `state` at all, which reads as nothing enabled — correct, since without the
 * row there are no casbin grants either.
 */
export function enabledCapabilities(
  state: HackathonState | undefined,
): number[] {
  return (state?.capabilities ?? [])
    .filter((c) => c.enabled)
    .map((c) => c.capability as number)
}

/**
 * The six capabilities in the order the switches render.
 *
 * Registration first because it gates getting in at all, results last because it
 * only matters once everything else is over. `SetCapabilities` takes a full list
 * of states rather than a delta, so this is also the list every write walks.
 */
export const CAPABILITY_ORDER: Capability[] = [
  Capability.CAPABILITY_REGISTER,
  Capability.CAPABILITY_PROPOSE_PROJECTS,
  Capability.CAPABILITY_SET_TEAM_PREFERENCES,
  Capability.CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
  Capability.CAPABILITY_VOTE,
  Capability.CAPABILITY_VIEW_RESULTS,
]

/** `SetCapabilities` input turning exactly `enabled` on and the rest off. */
export function capabilityStates(
  enabled: readonly number[],
): { capability: Capability; enabled: boolean }[] {
  const on = new Set(enabled)

  return CAPABILITY_ORDER.map((c) => ({
    capability: c,
    enabled: on.has(c as number),
  }))
}

/** A parsed, validated phase form, in the shape the RPCs want. */
export interface PhaseFormValues {
  name: string
  description: string
  startsAt?: Date
  endsAt?: Date
  /** Empty string means "no linked page". */
  pageId: string
  capabilities: Capability[]
}

export type PhaseFormResult =
  | { ok: true; values: PhaseFormValues }
  | { ok: false; message: string }

/**
 * One `datetime-local` field as a `Date`.
 *
 * The input submits local wall-clock time with no zone (`2026-08-25T09:00`), and
 * `new Date()` reads exactly that string as local — so an organizer's 9am is
 * their own 9am. Returns undefined for an empty field, null for one that is not a
 * valid date, so the caller can tell "not set" from "not a date".
 */
function parseLocalDateTime(
  raw: FormDataEntryValue | null,
): Date | undefined | null {
  if (typeof raw !== "string" || raw.trim() === "") return undefined
  const d = new Date(raw)

  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Validate a phase create/edit submission.
 *
 * Every rule here is one the backend also enforces — name 3–255 and a non-empty
 * description come from `buf.validate` on `CreateRequest`, and the both-or-neither
 * dates from its `starts_at_requires_ends_at` CEL rule. Repeating them buys a
 * legible message instead of a raw `InvalidArgument`; the RPC stays the authority,
 * and the actions surface its `details` when it disagrees.
 *
 * Description is required even on edit: `EditRequest.description` carries
 * `min_len = 1` when present, and the action always sends it.
 */
export function parsePhaseForm(form: FormData): PhaseFormResult {
  const rawName = form.get("name")
  const rawDescription = form.get("description")
  const rawPageId = form.get("pageId")

  const name = typeof rawName === "string" ? rawName.trim() : ""
  if (name.length < 3) {
    return { ok: false, message: "Name must be at least 3 characters" }
  }
  if (name.length > 255) {
    return { ok: false, message: "Name must be at most 255 characters" }
  }

  const description =
    typeof rawDescription === "string" ? rawDescription.trim() : ""
  if (description === "") {
    return { ok: false, message: "Description is required" }
  }

  const startsAt = parseLocalDateTime(form.get("startsAt"))
  const endsAt = parseLocalDateTime(form.get("endsAt"))
  if (startsAt === null || endsAt === null) {
    return { ok: false, message: "Dates must be valid" }
  }

  // Both or neither, and in order — the CEL rule refuses anything else, and a
  // half-scheduled phase is not a state worth having anyway.
  if ((startsAt === undefined) !== (endsAt === undefined)) {
    return {
      ok: false,
      message: "Set both a start and an end, or leave both empty",
    }
  }
  if (startsAt && endsAt && endsAt < startsAt) {
    return { ok: false, message: "End must be after the start" }
  }

  // Checkbox names repeat, so `getAll`. The values are the enum's own numbers —
  // `capabilityFromJSON` takes those as readily as the names, and hands back
  // UNRECOGNIZED for anything else. UNSPECIFIED and UNRECOGNIZED are then dropped
  // rather than rejected: `defined_only` would refuse them and neither can come
  // from a checkbox this page rendered. The Set covers `repeated.unique`.
  const capabilities = [
    ...new Set(
      form
        .getAll("capabilities")
        .filter((v): v is string => typeof v === "string")
        .map((v) => capabilityFromJSON(Number(v)))
        .filter(
          (c) =>
            c !== Capability.CAPABILITY_UNSPECIFIED &&
            c !== Capability.UNRECOGNIZED,
        ),
    ),
  ]

  return {
    ok: true,
    values: {
      name,
      description,
      startsAt,
      endsAt,
      pageId: typeof rawPageId === "string" ? rawPageId : "",
      capabilities,
    },
  }
}
