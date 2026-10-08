import { describe, it, expect } from "vitest"
import {
  LABEL_MAX,
  answerText,
  optionText,
  restoreLabels,
  setLabels,
  shortName,
  type LabeledQuestion,
} from "./teamAnswerLabels"

const SIZE: LabeledQuestion = { id: "size", letter: "B", kind: "enum" }
const REMOTE: LabeledQuestion = { id: "remote", letter: "D", kind: "bool" }
const UNI: LabeledQuestion = { id: "uni", letter: "A", kind: "text" }
const QUESTIONS = [UNI, SIZE, REMOTE]

describe("answerText", () => {
  it("uses the letter until a question has a short name", () => {
    expect(answerText(SIZE, "S", {})).toBe("B: S")
    expect(answerText(SIZE, "S", { size: { short: "size" } })).toBe("size: S")
  })

  it("reads a tick-box with its letter until it has its own words", () => {
    expect(answerText(REMOTE, "Yes", {})).toBe("D: Yes")
  })

  it("shows a tick-box's own word alone", () => {
    const named = { remote: { yes: "remote", no: "on site" } }

    expect(answerText(REMOTE, "Yes", named)).toBe("remote")
    expect(answerText(REMOTE, "No", named)).toBe("on site")
  })

  it("falls back for the side of a tick-box that has no word", () => {
    const named = { remote: { yes: "remote" } }

    expect(answerText(REMOTE, "No", named)).toBe("D: No")
  })

  it("prefixes free text like any other answer", () => {
    expect(answerText(UNI, "ETH Zurich", { uni: { short: "uni" } })).toBe(
      "uni: ETH Zurich",
    )
  })
})

describe("optionText", () => {
  it("renames only a tick-box's answers", () => {
    const named = {
      remote: { yes: "remote", no: "on site" },
      size: { short: "size" },
    }

    expect(optionText(REMOTE, "No", named)).toBe("on site")
    expect(optionText(SIZE, "S", named)).toBe("S")
  })
})

describe("setLabels", () => {
  it("trims, caps, and drops what is blank", () => {
    const next = setLabels({}, REMOTE, {
      yes: "  remote  ",
      no: "   ",
    })

    expect(next).toEqual({ remote: { yes: "remote" } })
    expect(
      setLabels({}, SIZE, { short: "x".repeat(LABEL_MAX + 5) }).size?.short,
    ).toBe("x".repeat(LABEL_MAX))
  })

  it("clears a question whose names are all blank", () => {
    const before = { size: { short: "size" } }

    expect(setLabels(before, SIZE, { short: " " })).toEqual({})
    expect(shortName(SIZE, {})).toBe("B")
  })

  it("keeps Yes and No words for tick-boxes only", () => {
    expect(setLabels({}, SIZE, { short: "size", yes: "big" })).toEqual({
      size: { short: "size" },
    })
  })

  it("gives a tick-box no short name — its words already say which question", () => {
    expect(
      setLabels({}, REMOTE, { short: "remote", yes: "remote", no: "on site" }),
    ).toEqual({ remote: { yes: "remote", no: "on site" } })
  })

  it("does not change what it was given", () => {
    const before = { size: { short: "size" } }
    setLabels(before, SIZE, { short: "tee" })

    expect(before).toEqual({ size: { short: "size" } })
  })
})

describe("restoreLabels", () => {
  it("keeps names for questions that still exist, tidied", () => {
    const stored = {
      size: { short: " size " },
      remote: { short: "remote", yes: "remote", no: "on site" },
      gone: { short: "old" },
    }

    expect(restoreLabels(stored, QUESTIONS)).toEqual({
      size: { short: "size" },
      remote: { yes: "remote", no: "on site" },
    })
  })

  it.each([null, "nonsense", 42, [], { size: "size" }, { size: { short: 7 } }])(
    "reads %j as nothing named",
    (stored) => {
      expect(restoreLabels(stored, QUESTIONS)).toEqual({})
    },
  )
})
