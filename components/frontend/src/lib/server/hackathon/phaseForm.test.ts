import { describe, it, expect } from "vitest"
import { parsePhaseForm } from "./phaseForm"

// Capability numeric values.
const REGISTER = 1
const PROPOSE_PROJECTS = 2
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
      capabilities: [],
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

  describe("capabilities", () => {
    it("maps checkbox numbers to enum values", () => {
      const v = values(form({ capabilities: ["1", "5"] }))
      expect(v.capabilities).toEqual([REGISTER, VOTE])
    })

    it("is empty when nothing is checked, which Edit reads as 'clear them'", () => {
      expect(values(form()).capabilities).toEqual([])
    })

    it("drops duplicates", () => {
      expect(values(form({ capabilities: ["2", "2"] })).capabilities).toEqual([
        PROPOSE_PROJECTS,
      ])
    })

    // `defined_only` would refuse these; neither can come from a rendered
    // checkbox, so they are dropped rather than turned into an error.
    it("drops unspecified and unrecognised values", () => {
      expect(
        values(form({ capabilities: ["0", "99", "banana", "2"] })).capabilities,
      ).toEqual([PROPOSE_PROJECTS])
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
