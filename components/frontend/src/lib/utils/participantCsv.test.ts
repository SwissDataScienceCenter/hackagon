import { describe, it, expect } from "vitest"
import { rosterCsv, type RosterRow } from "./participantCsv"

const row = (over: Partial<RosterRow> = {}): RosterRow => ({
  email: "alice@example.org",
  name: "Alice Doe",
  status: "Approved",
  role: "Member",
  links: { github: "https://github.com/alice", linkedin: "", renku: "" },
  ...over,
})

describe("rosterCsv", () => {
  it("heads who, where they stand, then one column per profile site", () => {
    const [header] = rosterCsv([]).split("\r\n")

    expect(header).toBe(
      "Email Address,Full Name,Status,Role,GitHub,LinkedIn,Renku",
    )
  })

  it("writes a person's row, a link not set as an empty cell", () => {
    const [, first] = rosterCsv([row()]).split("\r\n")

    expect(first).toBe(
      "alice@example.org,Alice Doe,Approved,Member,https://github.com/alice,,",
    )
  })
})
