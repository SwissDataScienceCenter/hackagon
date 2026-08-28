import { describe, it, expect } from "vitest"
import { CAPABILITY_ORDER, capabilityStates, parsePhaseForm } from "./phaseForm"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import { ALL_CAPABILITIES } from "$lib/utils/phase"

// Capability numeric value. Only one is named now that the phase form parses no
// capabilities: `capabilityStates` needs something to switch on.
const VOTE = 5

/** A form with the two always-required fields filled, plus whatever else. */
function form(fields: Record<string, string | string[]> = {}): FormData {
  const f = new FormData()
  f.set("name", "Ideation")
  f.set("description", "Define your idea.")
  for (const [k, v] of Object.entries(fields)) {
    f.delete(k)
    for (const one of Array.isArray(v) ? v : [v]) f.append(k, one)
  }

  return f
}

/** The values of a submission expected to pass, or a thrown assertion. */
function values(f: FormData) {
  const r = parsePhaseForm(f)
  if (!r.ok) throw new Error(`expected ok, got: ${r.message}`)

  return r.values
}

/** The message of a submission expected to fail. */
function message(f: FormData) {
  const r = parsePhaseForm(f)
  if (r.ok) throw new Error("expected a failure, got ok")

  return r.message
}

describe("parsePhaseForm", () => {
  it("accepts the minimum: a name and a description", () => {
    expect(values(form())).toMatchObject({
      name: "Ideation",
      description: "Define your idea.",
      startsAt: undefined,
      endsAt: undefined,
      pageId: "",
    })
  })

  it("trims name and description", () => {
    const v = values(form({ name: "  Hacking  ", description: "  Build.  " }))
    expect(v.name).toBe("Hacking")
    expect(v.description).toBe("Build.")
  })

  it("rejects a name under 3 characters, counted after trimming", () => {
    expect(message(form({ name: "  a  " }))).toMatch(/at least 3/)
  })

  it("rejects a name over 255 characters", () => {
    expect(message(form({ name: "x".repeat(256) }))).toMatch(/at most 255/)
  })

  // `EditRequest.description` carries min_len = 1, and the action always sends
  // the field — so a blank one has to fail here rather than at the backend.
  it("rejects a blank description", () => {
    expect(message(form({ description: "   " }))).toMatch(/required/)
  })

  describe("dates", () => {
    it("reads a datetime-local value as the organizer's own wall clock", () => {
      const v = values(
        form({ startsAt: "2026-09-01T09:00", endsAt: "2026-09-01T18:00" }),
      )
      // Local getters, not UTC — a 9am entered is a 9am stored.
      expect(v.startsAt?.getHours()).toBe(9)
      expect(v.endsAt?.getHours()).toBe(18)
      expect(v.startsAt?.getFullYear()).toBe(2026)
    })

    it("accepts neither date", () => {
      expect(values(form()).startsAt).toBeUndefined()
    })

    it("rejects a start with no end", () => {
      expect(message(form({ startsAt: "2026-09-01T09:00" }))).toMatch(
        /both a start and an end/,
      )
    })

    it("rejects an end with no start", () => {
      expect(message(form({ endsAt: "2026-09-01T18:00" }))).toMatch(
        /both a start and an end/,
      )
    })

    it("rejects an end before its start", () => {
      expect(
        message(
          form({ startsAt: "2026-09-02T09:00", endsAt: "2026-09-01T09:00" }),
        ),
      ).toMatch(/End must be after/)
    })

    // The CEL rule uses >=, so a zero-length phase is the backend's to accept.
    it("accepts an end equal to its start", () => {
      const v = values(
        form({ startsAt: "2026-09-01T09:00", endsAt: "2026-09-01T09:00" }),
      )
      expect(v.startsAt).toEqual(v.endsAt)
    })

    it("rejects a value that is not a date", () => {
      expect(
        message(form({ startsAt: "not-a-date", endsAt: "2026-09-01T18:00" })),
      ).toMatch(/valid/)
    })
  })

  it("keeps an empty pageId, which Edit reads as 'unlink'", () => {
    expect(values(form({ pageId: "" })).pageId).toBe("")
  })

  it("passes a pageId through for the backend to validate", () => {
    const id = "019fce51-2334-740f-b243-b1ee1e92e501"
    expect(values(form({ pageId: id })).pageId).toBe(id)
  })
})

// The switch panel is the only way to turn a capability on, and `SetCapabilities`
// takes a full list of states rather than a delta — so a capability missing from
// `CAPABILITY_ORDER` is sent as nothing, stays off forever, and has no switch to
// turn it on with. That is exactly what happened to `CAPABILITY_VIEW_TEAMS`
// between the backend adding it and the frontend listing it, and nothing failed.
//
// Derived from the generated enum rather than a literal count, so this fails on
// the day the backend adds the next one instead of on the day someone notices.
describe("CAPABILITY_ORDER", () => {
  const fromEnum = Object.values(Capability).filter(
    (v): v is Capability =>
      typeof v === "number" &&
      v !== Capability.CAPABILITY_UNSPECIFIED &&
      v !== Capability.UNRECOGNIZED,
  )

  it("covers every capability the proto defines", () => {
    expect([...CAPABILITY_ORDER].sort((a, b) => a - b)).toEqual(
      [...fromEnum].sort((a, b) => a - b),
    )
  })

  it("names each one exactly once", () => {
    expect(new Set(CAPABILITY_ORDER).size).toBe(CAPABILITY_ORDER.length)
  })

  // The switch panel reads this list and the overview's state card reads
  // `ALL_CAPABILITIES`; both show the same seven labels to the same organiser.
  // Reordering one and not the other is the mistake this catches — it would not
  // fail a type check, and nothing on screen would look broken, it would just be
  // two different answers to "what order do these happen in".
  it("renders in the same order as the participant-facing list", () => {
    expect(CAPABILITY_ORDER).toEqual(ALL_CAPABILITIES.map((c) => c.value))
  })
})

describe("capabilityStates", () => {
  it("writes a state for every capability, not just the enabled ones", () => {
    const states = capabilityStates([VOTE])
    expect(states).toHaveLength(CAPABILITY_ORDER.length)
    expect(states.filter((s) => s.enabled).map((s) => s.capability)).toEqual([
      VOTE,
    ])
  })

  it("turns everything off when nothing is enabled", () => {
    expect(capabilityStates([]).every((s) => !s.enabled)).toBe(true)
  })

  it("ignores a value it has no switch for", () => {
    expect(capabilityStates([99]).every((s) => !s.enabled)).toBe(true)
  })
})
