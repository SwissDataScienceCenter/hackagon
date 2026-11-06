import { describe, it, expect } from "vitest"
import { rosterCsv, type RosterRow } from "./participantCsv"

const QUESTIONS = [
  { key: "affiliation", label: "Affiliation" },
  { key: "conduct", label: "Code of Conduct" },
]

const row = (over: Partial<RosterRow> = {}): RosterRow => ({
  email: "alice@example.org",
  name: "Alice Doe",
  status: "Approved",
  role: "Member",
  links: { github: "https://github.com/alice", linkedin: "", renku: "" },
  answers: { affiliation: "ETH", conduct: "Yes" },
  ...over,
})

describe("rosterCsv", () => {
  it("heads who, where they stand, the profile sites, then one per question", () => {
    const [header] = rosterCsv([], QUESTIONS).split("\r\n")

    expect(header).toBe(
      "Email Address,Full Name,Status,Role,GitHub,LinkedIn,Renku," +
        "Affiliation,Code of Conduct",
    )
  })

  it("writes a person's row, a link not set as an empty cell", () => {
    const [, first] = rosterCsv([row()], QUESTIONS).split("\r\n")

    expect(first).toBe(
      "alice@example.org,Alice Doe,Approved,Member," +
        "https://github.com/alice,,,ETH,Yes",
    )
  })

  it("leaves an unanswered question's cell empty", () => {
    const [, first] = rosterCsv([row({ answers: {} })], QUESTIONS).split("\r\n")

    expect(first?.endsWith(",,")).toBe(true)
  })

  it("adds no question columns to a hackathon that asks nothing", () => {
    const [header] = rosterCsv([], []).split("\r\n")

    expect(header).toBe(
      "Email Address,Full Name,Status,Role,GitHub,LinkedIn,Renku",
    )
  })
})
