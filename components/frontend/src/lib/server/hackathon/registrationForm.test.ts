import { describe, it, expect } from "vitest"
import {
  parseQuestionForm,
  questionKind,
  questionRows,
  questionType,
} from "./registrationForm"

// QuestionType numeric values, stated rather than imported so a renumbering in
// the proto shows up here as a failure rather than passing silently.
const TEXT = 1
const BOOL = 2
const ENUM = 3

/** A form with the always-required fields filled, plus whatever else. */
function form(fields: Record<string, string> = {}): FormData {
  const f = new FormData()
  f.set("key", "affiliation")
  f.set("label", "Which university or company are you with?")
  f.set("kind", "text")
  for (const [k, v] of Object.entries(fields)) f.set(k, v)

  return f
}

/** The values of a submission expected to pass, or a thrown assertion. */
function values(f: FormData) {
  const r = parseQuestionForm(f)
  if (!r.ok) throw new Error(`expected ok, got: ${r.message}`)

  return r.values
}

/** The message of a submission expected to fail. */
function message(f: FormData): string {
  const r = parseQuestionForm(f)
  if (r.ok) throw new Error("expected a failure, got ok")

  return r.message
}

describe("parseQuestionForm", () => {
  it("accepts a minimal text question", () => {
    expect(values(form())).toEqual({
      key: "affiliation",
      label: "Which university or company are you with?",
      type: TEXT,
      mandatory: false,
      order: 0,
      options: [],
    })
  })

  it("trims the key and the question", () => {
    const v = values(form({ key: "  diet  ", label: "  Any needs?  " }))
    expect(v.key).toBe("diet")
    expect(v.label).toBe("Any needs?")
  })

  it("reads an unticked mandatory box as false", () => {
    // An unchecked checkbox submits nothing at all, so absence has to mean false
    // rather than "unchanged" — otherwise a required question could never be
    // relaxed back to optional.
    expect(values(form()).mandatory).toBe(false)
    expect(values(form({ mandatory: "true" })).mandatory).toBe(true)
  })

  describe("keys", () => {
    it("requires one", () => {
      expect(message(form({ key: "   " }))).toMatch(/key is required/i)
    })

    it.each([
      ["Affiliation", "an uppercase letter"],
      ["1st_choice", "a leading digit"],
      ["t-shirt", "a hyphen"],
      ["my key", "a space"],
      ["_private", "a leading underscore"],
    ])("rejects %s (%s)", (key) => {
      expect(message(form({ key }))).toMatch(/must start with a letter/i)
    })

    it.each(["a", "tshirt_size", "choice2"])("accepts %s", (key) => {
      expect(values(form({ key })).key).toBe(key)
    })

    it("rejects one over 64 characters", () => {
      expect(message(form({ key: "a".repeat(65) }))).toMatch(/at most 64/i)
    })
  })

  describe("the question text", () => {
    it("is required", () => {
      expect(message(form({ label: "  " }))).toMatch(/question is required/i)
    })

    it("is capped at 255 characters", () => {
      expect(message(form({ label: "x".repeat(256) }))).toMatch(/at most 255/i)
    })
  })

  describe("the answer type", () => {
    it("must be one of the three", () => {
      expect(message(form({ kind: "" }))).toMatch(/choose an answer type/i)
      expect(message(form({ kind: "textarea" }))).toMatch(
        /choose an answer type/i,
      )
    })

    it.each([
      ["text", TEXT],
      ["bool", BOOL],
    ])("maps %s onto the proto enum", (kind, type) => {
      expect(values(form({ kind })).type).toBe(type)
    })
  })

  describe("a fixed list", () => {
    const enumForm = (options: string) =>
      form({ key: "tshirt_size", kind: "enum", options })

    it("takes one option per line and drops the blanks", () => {
      const v = values(enumForm("S\n\n  M  \nL\n"))
      expect(v.type).toBe(ENUM)
      expect(v.options).toEqual(["S", "M", "L"])
    })

    it("keeps an option containing a comma intact", () => {
      // The reason this is newline-separated rather than comma-separated.
      expect(values(enumForm("Zurich, Switzerland\nOther")).options).toEqual([
        "Zurich, Switzerland",
        "Other",
      ])
    })

    it("needs at least two options", () => {
      // A dropdown with one choice is not a question, and one with none is a
      // question nobody can answer — the backend stores either happily.
      expect(message(enumForm("Only one"))).toMatch(/at least two options/i)
      expect(message(enumForm("  \n "))).toMatch(/at least two options/i)
    })

    it("rejects duplicates", () => {
      // An answer stores the option's text, so two identical options produce two
      // answers nobody can tell apart afterwards.
      expect(message(enumForm("M\nL\nM"))).toMatch(/different from each other/i)
    })

    it("drops options on a question that is not a fixed list", () => {
      // Otherwise a question switched away from `enum` keeps options nothing
      // reads, and switching back silently resurrects a stale list.
      expect(values(form({ kind: "text", options: "S\nM" })).options).toEqual(
        [],
      )
    })
  })

  describe("position", () => {
    it("defaults to 0 when the field is blank", () => {
      expect(values(form({ order: "" })).order).toBe(0)
    })

    it("takes a whole number", () => {
      expect(values(form({ order: "3" })).order).toBe(3)
    })

    it.each(["-1", "2.5", "many"])("rejects %s", (order) => {
      expect(message(form({ order }))).toMatch(/whole number/i)
    })
  })
})

describe("questionKind / questionType", () => {
  it("round-trips each kind", () => {
    for (const kind of ["text", "bool", "enum"] as const) {
      expect(questionKind(questionType(kind))).toBe(kind)
    }
  })

  it("falls back to text for a type it cannot render", () => {
    // UNSPECIFIED (0) and UNRECOGNIZED (-1). A text box at least shows the
    // organizer what they wrote, where refusing would hide the question.
    expect(questionKind(0)).toBe("text")
    expect(questionKind(-1)).toBe("text")
  })
})

describe("questionRows", () => {
  const q = (over: Partial<Record<string, unknown>> = {}) => ({
    id: "q1",
    key: "affiliation",
    label: "Affiliation",
    type: TEXT,
    mandatory: false,
    order: 1,
    options: [],
    ...over,
  })

  it("sorts by position, then by key so the order is never arbitrary", () => {
    const rows = questionRows([
      q({ id: "c", key: "c", order: 2 }),
      q({ id: "b", key: "b", order: 1 }),
      q({ id: "a", key: "a", order: 1 }),
    ])
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"])
  })

  it("counts the answers filed against each question", () => {
    const rows = questionRows(
      [q({ id: "q1" }), q({ id: "q2", key: "diet" })],
      [
        { questionId: "q1", participantId: "u1", textValue: "ETH" },
        { questionId: "q1", participantId: "u2", textValue: "EPFL" },
      ],
    )
    expect(rows.find((r) => r.id === "q1")?.answerCount).toBe(2)
    expect(rows.find((r) => r.id === "q2")?.answerCount).toBe(0)
  })

  it("reports zero when no answers were passed at all", () => {
    expect(questionRows([q()])[0].answerCount).toBe(0)
  })
})
