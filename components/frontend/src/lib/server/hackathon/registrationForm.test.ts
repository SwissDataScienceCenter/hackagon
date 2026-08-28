import { describe, it, expect } from "vitest"
import {
  answerValues,
  answeredParticipantIds,
  answersByParticipant,
  missingMandatory,
  parseAnswers,
  parseQuestionForm,
  questionKind,
  questionRows,
  questionType,
  readQuestionEcho,
  answerDistribution,
  answersByQuestion,
  answerLegend,
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
      publicAnswers: false,
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

  describe("showing the answers to participants", () => {
    it("is off when the box is unticked, which submits nothing", () => {
      expect(values(form()).publicAnswers).toBe(false)
    })

    it("is on when the box is ticked", () => {
      expect(values(form({ publicAnswers: "true" })).publicAnswers).toBe(true)
    })

    // Absence is a retraction here, not "leave it alone": the edit action sends
    // the parsed value unconditionally, because `EditQuestion` accepts this
    // field on an already-answered question and taking a question back is the
    // reason it does.
    it("is off for any value other than the box's own", () => {
      expect(values(form({ publicAnswers: "on" })).publicAnswers).toBe(false)
    })
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

describe("readQuestionEcho", () => {
  it("carries every field back as typed", () => {
    expect(
      readQuestionEcho(
        form({
          kind: "enum",
          order: "3",
          mandatory: "true",
          publicAnswers: "true",
          options: "S\nM\nL",
        }),
      ),
    ).toEqual({
      key: "affiliation",
      label: "Which university or company are you with?",
      kind: "enum",
      mandatory: true,
      order: 3,
      options: ["S", "M", "L"],
      publicAnswers: true,
    })
  })

  it("never refuses a submission the parser would", () => {
    // The whole point: this runs *because* the parser said no, so anything it
    // rejected in turn would drop the values it exists to preserve.
    const echo = readQuestionEcho(
      form({ key: "Not A Key", kind: "wat", order: "-1" }),
    )

    expect(echo.key).toBe("Not A Key")
    expect(echo.kind).toBe("text")
    expect(echo.order).toBe(0)
  })

  it("keeps a position of 0, which is legitimate", () => {
    expect(readQuestionEcho(form({ order: "0" })).order).toBe(0)
  })

  it("keeps options typed against a kind that has no use for them", () => {
    // Unlike the parser, which drops them: the organizer may have typed a list
    // and then mis-set the type, and the list is the part that was fine.
    expect(
      readQuestionEcho(form({ kind: "text", options: "S\nM" })).options,
    ).toEqual(["S", "M"])
  })

  it("reads an absent checkbox as false", () => {
    const echo = readQuestionEcho(form())
    expect(echo.mandatory).toBe(false)
    expect(echo.publicAnswers).toBe(false)
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
    publicAnswers: false,
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
    expect(questionRows([q()])[0]?.answerCount).toBe(0)
  })

  it("carries whether the answers are shown to the whole cohort", () => {
    const rows = questionRows([
      q({ id: "q1", key: "a", publicAnswers: true }),
      q({ id: "q2", key: "b", publicAnswers: false }),
    ])
    expect(rows.map((r) => r.publicAnswers)).toEqual([true, false])
  })
})

describe("answerDistribution", () => {
  const row = (over: Partial<Record<string, unknown>> = {}) => ({
    id: "q1",
    key: "tshirt_size",
    label: "T-shirt size",
    kind: "enum" as const,
    mandatory: false,
    order: 1,
    options: ["S", "M", "L"],
    publicAnswers: false,
    answerCount: 0,
    ...over,
  })

  const said = (
    questionId: string,
    participantId: string,
    textValue: string,
  ) => ({ questionId, participantId, textValue })

  it("counts a fixed list in the question's own order", () => {
    expect(
      answerDistribution(
        [row()],
        [said("q1", "u1", "M"), said("q1", "u2", "S"), said("q1", "u3", "M")],
      ).q1,
    ).toEqual([
      { label: "S", count: 1 },
      { label: "M", count: 2 },
      { label: "L", count: 0 },
    ])
  })

  it("keeps an option nobody chose", () => {
    // "Nobody picked Large" is the fact an organizer ordering t-shirts came for,
    // so an empty bucket is a result and not a row to drop.
    const tally = answerDistribution([row()], [said("q1", "u1", "S")]).q1
    expect(tally?.map((t) => t.label)).toEqual(["S", "M", "L"])
  })

  it("appends an answer that is no longer an option rather than losing it", () => {
    // Should not arise — the backend refuses an options change once anyone has
    // answered — but a tally that silently drops answers is worse than one
    // showing a value that surprises.
    expect(answerDistribution([row()], [said("q1", "u1", "XXL")]).q1).toEqual([
      { label: "S", count: 0 },
      { label: "M", count: 0 },
      { label: "L", count: 0 },
      { label: "XXL", count: 1 },
    ])
  })

  it("counts a tick-box as yes and no, both always present", () => {
    const q = row({ id: "coc", kind: "bool", options: [] })
    expect(
      answerDistribution(
        [q],
        [
          { questionId: "coc", participantId: "u1", boolValue: true },
          { questionId: "coc", participantId: "u2", boolValue: false },
          { questionId: "coc", participantId: "u3", boolValue: true },
        ],
      ).coc,
    ).toEqual([
      { label: "Yes", count: 2 },
      { label: "No", count: 1 },
    ])

    expect(answerDistribution([q], []).coc).toEqual([
      { label: "Yes", count: 0 },
      { label: "No", count: 0 },
    ])
  })

  it("leaves free text out entirely", () => {
    // Absent rather than empty: a hundred different sentences counted once each
    // is a list of answers, not a summary of them, and the page reads the
    // absence as "nothing to show here".
    const tally = answerDistribution(
      [row({ id: "aff", kind: "text", options: [] })],
      [said("aff", "u1", "ETH")],
    )
    expect(tally.aff).toBeUndefined()
  })

  it("does not let one question's answers reach another", () => {
    const tally = answerDistribution(
      [row(), row({ id: "q2", key: "meal", options: ["Meat", "Veg"] })],
      [said("q1", "u1", "M"), said("q2", "u1", "Veg")],
    )
    expect(tally.q1?.find((t) => t.label === "M")?.count).toBe(1)
    expect(tally.q2?.find((t) => t.label === "Veg")?.count).toBe(1)
    expect(tally.q2?.find((t) => t.label === "Meat")?.count).toBe(0)
  })
})

describe("answersByQuestion", () => {
  const row = (over: Partial<Record<string, unknown>> = {}) => ({
    id: "q1",
    key: "affiliation",
    label: "Affiliation",
    kind: "text" as const,
    mandatory: false,
    order: 1,
    options: [] as string[],
    publicAnswers: false,
    answerCount: 0,
    ...over,
  })

  const roster = new Map([
    ["u1", "Alice"],
    ["u2", "Bob"],
    ["u3", "Charles"],
  ])

  it("names each answer and orders them by name", () => {
    const byQuestion = answersByQuestion(
      [row()],
      [
        { questionId: "q1", participantId: "u2", textValue: "EPFL" },
        { questionId: "q1", participantId: "u1", textValue: "ETH" },
      ],
      roster,
    )

    expect(byQuestion.q1?.answers).toEqual([
      { participantId: "u1", name: "Alice", value: "ETH", departed: false },
      { participantId: "u2", name: "Bob", value: "EPFL", departed: false },
    ])
  })

  it("counts the roster members with nothing on file", () => {
    const byQuestion = answersByQuestion(
      [row()],
      [{ questionId: "q1", participantId: "u1", textValue: "ETH" }],
      roster,
    )
    expect(byQuestion.q1?.missing).toBe(2)
  })

  it("keeps an answer from someone who has left, and marks it", () => {
    // RemoveParticipant deletes the participant row and nothing deletes their
    // answers, so this outlives them. Dropping it would leave the list holding
    // fewer answers than the tally beside it.
    const byQuestion = answersByQuestion(
      [row()],
      [{ questionId: "q1", participantId: "gone", textValue: "ETH" }],
      roster,
    )

    expect(byQuestion.q1?.answers).toEqual([
      {
        participantId: "gone",
        name: "No longer in this hackathon",
        value: "ETH",
        departed: true,
      },
    ])
    // Three roster members still owe an answer; the departed one is not a
    // fourth, and never pushes this below zero.
    expect(byQuestion.q1?.missing).toBe(3)
  })

  it("puts people who have left after everyone still here", () => {
    const byQuestion = answersByQuestion(
      [row()],
      [
        { questionId: "q1", participantId: "gone", textValue: "Elsewhere" },
        { questionId: "q1", participantId: "u3", textValue: "USI" },
      ],
      roster,
    )
    expect(byQuestion.q1?.answers.map((a) => a.name)).toEqual([
      "Charles",
      "No longer in this hackathon",
    ])
  })

  it("carries a tick-box answer as a boolean", () => {
    const byQuestion = answersByQuestion(
      [row({ id: "coc", kind: "bool" })],
      [{ questionId: "coc", participantId: "u1", boolValue: false }],
      roster,
    )
    expect(byQuestion.coc?.answers[0]?.value).toBe(false)
  })

  it("gives a question nobody answered an empty list and the whole roster", () => {
    const byQuestion = answersByQuestion([row()], [], roster)
    expect(byQuestion.q1).toEqual({ answers: [], missing: 3 })
  })

  it("drops an answer to a question that no longer exists", () => {
    const byQuestion = answersByQuestion(
      [row()],
      [{ questionId: "deleted", participantId: "u1", textValue: "ETH" }],
      roster,
    )
    expect(Object.keys(byQuestion)).toEqual(["q1"])
    expect(byQuestion.q1?.answers).toEqual([])
  })
})

describe("parseAnswers", () => {
  const q = (
    id: string,
    kind: "text" | "bool" | "enum",
    mandatory = false,
  ) => ({
    id,
    key: id,
    label: id,
    kind,
    mandatory,
    order: 1,
    options: [] as string[],
    publicAnswers: false,
    answerCount: 0,
  })

  /** A form carrying `answer:<id>` fields. */
  const answerForm = (fields: Record<string, string>) => {
    const f = new FormData()
    for (const [k, v] of Object.entries(fields)) f.set(`answer:${k}`, v)

    return f
  }

  it("puts a text answer in textValue", () => {
    expect(
      parseAnswers(answerForm({ affiliation: "ETH" }), [
        q("affiliation", "text"),
      ]),
    ).toEqual([
      { questionId: "affiliation", participantId: "", textValue: "ETH" },
    ])
  })

  it("puts a ticked box in boolValue, not textValue", () => {
    // The backend refuses a text answer to a bool question, so the arm of the
    // oneof has to follow the question rather than the form field.
    expect(
      parseAnswers(answerForm({ conduct: "true" }), [q("conduct", "bool")]),
    ).toEqual([{ questionId: "conduct", participantId: "", boolValue: true }])
  })

  it("sends false for an optional box left unticked", () => {
    // "No" is an answer. Only a *required* box withholds it.
    expect(parseAnswers(new FormData(), [q("newsletter", "bool")])).toEqual([
      { questionId: "newsletter", participantId: "", boolValue: false },
    ])
  })

  it("withholds a required box left unticked so the backend refuses it", () => {
    // Otherwise a blank code-of-conduct would be recorded as a cheerful "no"
    // and the submission would succeed.
    expect(parseAnswers(new FormData(), [q("conduct", "bool", true)])).toEqual(
      [],
    )
  })

  it("omits a blank text answer rather than sending an empty string", () => {
    // The backend checks that a mandatory question has an answer, not that the
    // answer says anything — `""` would let a required question through blank.
    expect(
      parseAnswers(answerForm({ diet: "   " }), [q("diet", "text", true)]),
    ).toEqual([])
  })

  it("trims a text answer", () => {
    expect(
      parseAnswers(answerForm({ affiliation: "  ETH  " }), [
        q("affiliation", "text"),
      ])[0]?.textValue,
    ).toBe("ETH")
  })

  it("sends an enum choice as text and omits the blank one", () => {
    const questions = [q("size", "enum")]
    expect(
      parseAnswers(answerForm({ size: "M" }), questions)[0]?.textValue,
    ).toBe("M")
    expect(parseAnswers(answerForm({ size: "" }), questions)).toEqual([])
  })

  it("ignores a field for a question that no longer exists", () => {
    // The backend refuses the whole submission over one unknown question id, so
    // a stale field must not ride along.
    expect(parseAnswers(answerForm({ gone: "x" }), [])).toEqual([])
  })

  it("never names whose answer it is", () => {
    // The server derives the answerer from the token; sending an id would invite
    // a client to claim someone else's.
    const parsed = parseAnswers(answerForm({ affiliation: "ETH" }), [
      q("affiliation", "text"),
    ])
    expect(parsed[0]?.participantId).toBe("")
  })
})

describe("answerValues", () => {
  it("keys answers by question, keeping bools as bools", () => {
    expect(
      answerValues([
        { questionId: "a", participantId: "u", textValue: "ETH" },
        { questionId: "b", participantId: "u", boolValue: true },
        { questionId: "c", participantId: "u", boolValue: false },
      ]),
    ).toEqual({ a: "ETH", b: true, c: false })
  })

  it("leaves an answer with neither arm set out entirely", () => {
    // So an unanswered question renders empty rather than as the string "false".
    expect(answerValues([{ questionId: "a", participantId: "u" }])).toEqual({})
  })
})

describe("missingMandatory", () => {
  const q = (id: string, mandatory: boolean) => ({
    id,
    key: `${id}_key`,
    label: id,
    kind: "text" as const,
    mandatory,
    order: 1,
    options: [] as string[],
    publicAnswers: false,
    answerCount: 0,
  })

  it("names the required questions with no answer", () => {
    expect(
      missingMandatory(
        [q("a", true), q("b", false), q("c", true)],
        [{ questionId: "a", participantId: "", textValue: "x" }],
      ),
    ).toEqual(["c_key"])
  })

  it("is empty when every required question is answered", () => {
    expect(
      missingMandatory(
        [q("a", true)],
        [{ questionId: "a", participantId: "", textValue: "x" }],
      ),
    ).toEqual([])
  })
})

describe("answersByParticipant", () => {
  const rows = questionRows([
    {
      id: "q1",
      key: "affiliation",
      label: "Affiliation",
      type: TEXT,
      mandatory: true,
      order: 1,
      options: [],
      publicAnswers: true,
    },
    {
      id: "q2",
      key: "conduct",
      label: "Code of Conduct",
      type: BOOL,
      mandatory: true,
      order: 2,
      options: [],
      publicAnswers: false,
    },
  ])

  it("groups by participant and orders by the question order", () => {
    const grouped = answersByParticipant(rows, [
      { questionId: "q2", participantId: "u1", boolValue: true },
      { questionId: "q1", participantId: "u1", textValue: "ETH" },
      { questionId: "q1", participantId: "u2", textValue: "EPFL" },
    ])
    expect(Object.keys(grouped).sort()).toEqual(["u1", "u2"])
    expect(grouped.u1?.map((a) => a.key)).toEqual(["affiliation", "conduct"])
    expect(grouped.u1?.[1]?.value).toBe(true)
  })

  it("marks each answer with whether the cohort can read it", () => {
    // So a profile can chip the shared ones without carrying the question list
    // as well. On a peer's profile every entry is true, because the backend
    // sends nothing else.
    const grouped = answersByParticipant(rows, [
      { questionId: "q1", participantId: "u1", textValue: "ETH" },
      { questionId: "q2", participantId: "u1", boolValue: true },
    ])
    expect(grouped.u1?.map((a) => a.publicAnswers)).toEqual([true, false])
  })

  it("leaves out a participant who answered nothing", () => {
    // Absence is the signal an organizer chases; an empty list per person would
    // make "has not answered" indistinguishable from "answered blankly".
    expect(answersByParticipant(rows, [])).toEqual({})
  })

  it("drops an answer whose question has since been deleted", () => {
    // Otherwise it renders as a value with no question, which says nothing.
    expect(
      answersByParticipant(rows, [
        { questionId: "gone", participantId: "u1", textValue: "x" },
      ]),
    ).toEqual({})
  })

  it("keeps a false answer, which is an answer", () => {
    const grouped = answersByParticipant(rows, [
      { questionId: "q2", participantId: "u1", boolValue: false },
    ])
    expect(grouped.u1?.[0]?.value).toBe(false)
  })

  it("skips an answer carrying neither arm", () => {
    expect(
      answersByParticipant(rows, [{ questionId: "q1", participantId: "u1" }]),
    ).toEqual({})
  })
})

describe("answeredParticipantIds", () => {
  it("names each person once, however many answers they filed", () => {
    expect(
      answeredParticipantIds([
        { questionId: "q1", participantId: "u1", textValue: "ETH" },
        { questionId: "q2", participantId: "u1", boolValue: true },
        { questionId: "q1", participantId: "u2", textValue: "EPFL" },
      ]),
    ).toEqual(new Set(["u1", "u2"]))
  })

  it("is empty when nobody has answered", () => {
    // What the roster's "No answers" marker reads: every row marked, rather than
    // a page that cannot tell an unanswered form from a failed load.
    expect(answeredParticipantIds([])).toEqual(new Set())
  })

  it("counts an answer to a since-deleted question", () => {
    // Unlike `answersByParticipant`, which drops it: there is nothing to label,
    // but the person did fill the form in, and marking them as missing would
    // send an organizer chasing someone who already answered.
    expect(
      answeredParticipantIds([
        { questionId: "gone", participantId: "u1", textValue: "x" },
      ]),
    ).toEqual(new Set(["u1"]))
  })
})

describe("answerLegend", () => {
  const row = (over: Partial<Record<string, unknown>> = {}) => ({
    id: "q1",
    key: "experience",
    label: "Experience level",
    kind: "enum" as const,
    mandatory: false,
    order: 1,
    options: ["Beginner", "Intermediate", "Advanced"],
    publicAnswers: false,
    answerCount: 0,
    ...over,
  })

  it("letters the questions in order and numbers each one's options", () => {
    const { questions } = answerLegend(
      [
        row(),
        row({
          id: "q2",
          key: "track",
          label: "Track",
          options: ["Data", "Web"],
        }),
      ],
      [],
    )

    expect(questions).toEqual([
      {
        id: "q1",
        label: "Experience level",
        letter: "A",
        options: [
          { code: "A1", label: "Beginner" },
          { code: "A2", label: "Intermediate" },
          { code: "A3", label: "Advanced" },
        ],
      },
      {
        id: "q2",
        label: "Track",
        letter: "B",
        options: [
          { code: "B1", label: "Data" },
          { code: "B2", label: "Web" },
        ],
      },
    ])
  })

  it("leaves out anything that cannot be coded", () => {
    const { questions } = answerLegend(
      [
        row({ id: "text", kind: "text", options: [] }),
        row({ id: "coc", kind: "bool", options: [] }),
        row({ id: "empty", options: [] }),
        row({ id: "q1" }),
      ],
      [],
    )

    expect(questions.map((q) => q.id)).toEqual(["q1"])
    expect(questions.map((q) => q.letter)).toEqual(["A"])
  })

  it("keeps a letter with its question when an earlier one is not shown", () => {
    // The point of lettering every enum question rather than only the shown
    // ones: `q2` is B whichever of the two an organizer decides to display.
    const { questions } = answerLegend([row(), row({ id: "q2" })], [])

    expect(questions.find((q) => q.id === "q2")?.letter).toBe("B")
  })

  it("codes each person's answer, grouped by answerer", () => {
    const { codesByParticipant } = answerLegend(
      [row(), row({ id: "q2", options: ["Data", "Web"] })],
      [
        { questionId: "q1", participantId: "alice", textValue: "Advanced" },
        { questionId: "q2", participantId: "alice", textValue: "Web" },
        { questionId: "q1", participantId: "bob", textValue: "Beginner" },
      ],
    )

    expect(codesByParticipant).toEqual({
      alice: {
        q1: { code: "A3", label: "Advanced" },
        q2: { code: "B2", label: "Web" },
      },
      bob: { q1: { code: "A1", label: "Beginner" } },
    })
  })

  it("has nothing for someone who did not answer", () => {
    const { codesByParticipant } = answerLegend([row()], [])

    expect(codesByParticipant).toEqual({})
  })

  it("ignores answers to questions that carry no code", () => {
    const { codesByParticipant } = answerLegend(
      [row(), row({ id: "coc", kind: "bool", options: [] })],
      [
        { questionId: "coc", participantId: "alice", boolValue: true },
        { questionId: "gone", participantId: "alice", textValue: "whatever" },
      ],
    )

    expect(codesByParticipant).toEqual({})
  })

  it("marks an answer that is no longer one of the options", () => {
    const { codesByParticipant } = answerLegend(
      [row()],
      [{ questionId: "q1", participantId: "alice", textValue: "Wizard" }],
    )

    expect(codesByParticipant.alice?.q1).toEqual({
      code: "A?",
      label: "Wizard",
    })
  })

  it("keeps lettering past Z", () => {
    const questions = Array.from({ length: 27 }, (_, i) =>
      row({ id: `q${i}`, options: ["Yes"] }),
    )

    expect(answerLegend(questions, []).questions.at(-1)?.letter).toBe("AA")
  })
})
