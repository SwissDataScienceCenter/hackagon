import { describe, it, expect } from "vitest"
import {
  NO_FILTERS,
  countAnswers,
  isFiltering,
  matches,
  restoreFilters,
  setText,
  toggleAnswer,
  type FilterQuestion,
  type PoolFilters,
} from "./teamPoolFilter"

const QUESTIONS: FilterQuestion[] = [
  {
    id: "exp",
    kind: "enum",
    options: [{ label: "First time" }, { label: "A few" }, { label: "Many" }],
  },
  { id: "remote", kind: "bool", options: [{ label: "Yes" }, { label: "No" }] },
  { id: "skills", kind: "text", options: [] },
]

const person = (id: string, codes: Record<string, string> = {}) => ({
  id,
  codes: Object.fromEntries(
    Object.entries(codes).map(([q, label]) => [q, { label }]),
  ),
})

const filters = (over: Partial<PoolFilters> = {}): PoolFilters => ({
  ...NO_FILTERS,
  ...over,
})

describe("matches", () => {
  it("lets everyone through when nothing is picked", () => {
    expect(matches(person("a"), NO_FILTERS)).toBe(true)
  })

  it("widens within one question", () => {
    const f = filters({ answers: { exp: ["First time", "A few"] } })

    expect(matches(person("a", { exp: "First time" }), f)).toBe(true)
    expect(matches(person("b", { exp: "A few" }), f)).toBe(true)
    expect(matches(person("c", { exp: "Many" }), f)).toBe(false)
  })

  it("narrows across questions", () => {
    const f = filters({
      answers: { exp: ["A few"], remote: ["Yes"] },
    })

    expect(matches(person("a", { exp: "A few", remote: "Yes" }), f)).toBe(true)
    expect(matches(person("b", { exp: "A few", remote: "No" }), f)).toBe(false)
  })

  it("does not let through someone who skipped a filtered question", () => {
    const f = filters({ answers: { exp: ["Many"] } })

    expect(matches(person("a"), f)).toBe(false)
  })

  it("matches free text ignoring case and the spaces around it", () => {
    const f = filters({ texts: { skills: "  PYTHON " } })

    expect(matches(person("a", { skills: "Python, design" }), f)).toBe(true)
    expect(matches(person("b", { skills: "Design" }), f)).toBe(false)
    expect(matches(person("c"), f)).toBe(false)
  })
})

describe("toggleAnswer", () => {
  it("picks, then unpicks, and leaves no empty question behind", () => {
    const once = toggleAnswer(NO_FILTERS, "exp", "Many")
    expect(once.answers).toEqual({ exp: ["Many"] })

    const twice = toggleAnswer(once, "exp", "Many")
    expect(twice.answers).toEqual({})
    expect(isFiltering(twice)).toBe(false)
  })

  it("does not change what it was given", () => {
    const before = filters({ answers: { exp: ["Many"] } })
    toggleAnswer(before, "exp", "A few")

    expect(before.answers).toEqual({ exp: ["Many"] })
  })
})

describe("setText", () => {
  it("removes a filter whose text is blank", () => {
    const on = setText(NO_FILTERS, "skills", "py")
    expect(on.texts).toEqual({ skills: "py" })

    expect(setText(on, "skills", "   ").texts).toEqual({})
  })
})

describe("restoreFilters", () => {
  it("keeps what still means something", () => {
    const stored = {
      answers: { exp: ["Many"], remote: ["Yes"] },
      texts: { skills: "py" },
    }

    expect(restoreFilters(stored, QUESTIONS)).toEqual(stored)
  })

  it("drops questions and answers that no longer exist", () => {
    const stored = {
      answers: { exp: ["Many", "Wizard"], gone: ["x"], remote: ["Maybe"] },
      texts: { skills: "   ", alsoGone: "py" },
    }

    expect(restoreFilters(stored, QUESTIONS)).toEqual({
      answers: { exp: ["Many"] },
      texts: {},
    })
  })

  it("does not take a free-text question's answers as picks, or the reverse", () => {
    const stored = {
      answers: { skills: ["py"] },
      texts: { exp: "Many" },
    }

    expect(restoreFilters(stored, QUESTIONS)).toEqual(NO_FILTERS)
  })

  it.each([null, "nonsense", 42, [], { answers: "x", texts: [] }])(
    "reads %j as no filter",
    (stored) => {
      expect(restoreFilters(stored, QUESTIONS)).toEqual(NO_FILTERS)
    },
  )
})

describe("countAnswers", () => {
  it("counts each answer by question", () => {
    const pool = [
      person("a", { exp: "Many", remote: "Yes" }),
      person("b", { exp: "Many" }),
      person("c", { exp: "A few" }),
    ]

    expect(countAnswers(pool)).toEqual({
      exp: { Many: 2, "A few": 1 },
      remote: { Yes: 1 },
    })
  })
})
