import { describe, it, expect } from "vitest"
import type { Submission } from "$lib/server/grpc/generated/hackathon/entities/submission"
import type { Team } from "$lib/server/grpc/generated/hackathon/entities/team"
import type { User } from "$lib/server/grpc/generated/user/entities/user"
import {
  submissionOverview,
  submissionStanding,
  submissionVersions,
} from "./submissions"

// SubmissionStatus numeric values: DRAFT=1, FINAL=2.
const DRAFT = 1
const FINAL = 2

const ALICE = "user-alice"
const BOB = "user-bob"

const names = new Map([
  [ALICE, "Alice Wonderland"],
  [BOB, "Bob Henderson"],
])

/** A submission with only the fields this helper reads. */
function sub(fields: Partial<Submission> & { version: number }): Submission {
  return {
    id: `s${fields.version}`,
    status: DRAFT,
    result: `result-v${fields.version}`,
    createdAt: new Date("2026-08-01T10:00:00Z"),
    modifiedAt: new Date("2026-08-01T10:00:00Z"),
    teamId: "team-1",
    projectId: "project-1",
    creatorId: ALICE,
    ...fields,
  }
}

describe("submissionVersions", () => {
  it("reports nothing for a team with no submissions", () => {
    expect(submissionVersions([], names)).toEqual({
      latest: null,
      latestFinal: null,
      earlier: [],
    })
  })

  it("sorts by version rather than trusting the given order", () => {
    const r = submissionVersions(
      [sub({ version: 3 }), sub({ version: 1 }), sub({ version: 2 })],
      names,
    )

    expect(r.latest?.version).toBe(3)
    expect(r.earlier.map((v) => v.version)).toEqual([2, 1])
  })

  it("has no final entry while every version is a draft", () => {
    const r = submissionVersions([sub({ version: 1 })], names)

    expect(r.latest?.version).toBe(1)
    expect(r.latestFinal).toBeNull()
    expect(r.earlier).toEqual([])
  })

  it("collapses latest and latestFinal when the newest version is final", () => {
    const r = submissionVersions(
      [sub({ version: 1, status: FINAL }), sub({ version: 2, status: FINAL })],
      names,
    )

    expect(r.latest?.version).toBe(2)
    expect(r.latestFinal?.version).toBe(2)
    // Only v1 is left over — v2 is covered by both prominent slots.
    expect(r.earlier.map((v) => v.version)).toEqual([1])
  })

  it("keeps a newer draft separate from the final version it sits on", () => {
    const r = submissionVersions(
      [
        sub({ version: 1, status: FINAL }),
        sub({ version: 2, status: FINAL }),
        sub({ version: 3, status: DRAFT }),
      ],
      names,
    )

    expect(r.latest?.version).toBe(3)
    expect(r.latestFinal?.version).toBe(2)
  })

  it("never repeats a final version pushed out of last place by a draft", () => {
    const r = submissionVersions(
      [
        sub({ version: 1, status: FINAL }),
        sub({ version: 2, status: FINAL }),
        sub({ version: 3, status: DRAFT }),
      ],
      names,
    )

    // v2 renders in its own block, so it must not also appear under "earlier" —
    // `earlier` excluding only `latest` was the original bug.
    expect(r.earlier.map((v) => v.version)).toEqual([1])
  })

  it("resolves the creator's display name", () => {
    const r = submissionVersions([sub({ version: 1, creatorId: BOB })], names)

    expect(r.latest?.creator).toBe("Bob Henderson")
  })

  it("leaves the creator unresolved when they are no longer a member", () => {
    const r = submissionVersions(
      [sub({ version: 1, creatorId: "user-departed" })],
      names,
    )

    expect(r.latest?.creator).toBeUndefined()
  })

  it("reports who finalized a version, which need not be its author", () => {
    const r = submissionVersions(
      [
        sub({
          version: 1,
          status: FINAL,
          creatorId: ALICE,
          modifierId: BOB,
          modifiedAt: new Date("2026-08-02T12:00:00Z"),
        }),
      ],
      names,
    )

    expect(r.latestFinal?.creator).toBe("Alice Wonderland")
    expect(r.latestFinal?.finalizedBy).toBe("Bob Henderson")
    expect(r.latestFinal?.finalizedAt).toEqual(new Date("2026-08-02T12:00:00Z"))
  })

  it("reports no finalization on a draft, whose modifier only echoes creation", () => {
    const r = submissionVersions(
      [sub({ version: 1, status: DRAFT, modifierId: ALICE })],
      names,
    )

    expect(r.latest?.finalizedAt).toBeUndefined()
    expect(r.latest?.finalizedBy).toBeUndefined()
  })

  it("carries an absent result through as undefined", () => {
    const r = submissionVersions(
      [sub({ version: 1, result: undefined })],
      names,
    )

    expect(r.latest?.result).toBeUndefined()
  })
})

describe("submissionStanding", () => {
  it("is missing with nothing filed", () => {
    expect(submissionStanding(submissionVersions([], names))).toBe("missing")
  })

  it("is draft while nothing is final", () => {
    const r = submissionVersions(
      [sub({ version: 1 }), sub({ version: 2 })],
      names,
    )

    expect(submissionStanding(r)).toBe("draft")
  })

  it("stays final when a newer draft sits on top of the entry", () => {
    const r = submissionVersions(
      [sub({ version: 1, status: FINAL }), sub({ version: 2, status: DRAFT })],
      names,
    )

    expect(submissionStanding(r)).toBe("final")
  })
})

describe("submissionOverview", () => {
  const user = (id: string, displayName: string): User =>
    ({ id, displayName, username: id }) as User

  /** A team with only the fields the overview reads. */
  const team = (id: string, name: string, members: User[] = []): Team =>
    ({ id, name, projectId: "project-1", members }) as unknown as Team

  const titles = new Map([["project-1", "Flood maps"]])

  it("puts teams with nothing first, then drafts, then finals, each by name", () => {
    const teams = [
      team("t-final", "Alpha"),
      team("t-draft-b", "Bravo"),
      team("t-none", "Zulu"),
      team("t-draft-a", "Able"),
    ]
    const byTeam = new Map([
      ["t-final", [sub({ version: 1, status: FINAL })]],
      ["t-draft-b", [sub({ version: 1 })]],
      ["t-draft-a", [sub({ version: 1 })]],
    ])

    const rows = submissionOverview(teams, byTeam, titles, names)

    expect(rows.map((r) => [r.teamName, r.standing])).toEqual([
      ["Zulu", "missing"],
      ["Able", "draft"],
      ["Bravo", "draft"],
      ["Alpha", "final"],
    ])
  })

  it("names the project, and says so when it cannot", () => {
    const rows = submissionOverview(
      [
        team("t1", "Known"),
        { ...team("t2", "Orphan"), projectId: "gone" } as Team,
      ],
      new Map(),
      titles,
      names,
    )

    expect(rows.map((r) => r.projectTitle)).toEqual([
      "Flood maps",
      "Unknown project",
    ])
  })

  it("lists members by name, sorted, falling back to the username", () => {
    const rows = submissionOverview(
      [
        team("t1", "Team", [
          user("u-zed", "Zed"),
          { id: "u-anon", displayName: "", username: "anon" } as User,
          user("u-amy", "Amy"),
        ]),
      ],
      new Map(),
      titles,
      names,
    )

    expect(rows[0]?.members).toEqual(["Amy", "anon", "Zed"])
  })
})
