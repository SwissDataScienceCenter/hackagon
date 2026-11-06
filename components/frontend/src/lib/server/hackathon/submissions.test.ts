import { describe, it, expect } from "vitest"
import { ClientError, Status } from "nice-grpc-common"
import type { Submission } from "$lib/server/grpc/generated/hackathon/entities/submission"
import type { Team } from "$lib/server/grpc/generated/hackathon/entities/team"
import type { TeamServiceClient } from "$lib/server/grpc/generated/hackathon/team_service"
import type { User } from "$lib/server/grpc/generated/user/entities/user"
import {
  submissionEntry,
  submissionOverview,
  submissionsByTeam,
  submissionVersions,
  teamEntries,
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

  it("carries the proto's result through as the repository URL", () => {
    const r = submissionVersions([sub({ version: 1 })], names)

    expect(r.latest?.repositoryUrl).toBe("result-v1")
  })

  it("carries the attachments link and the description through", () => {
    const r = submissionVersions(
      [
        sub({
          version: 1,
          attachmentFolderUrl: "https://drive.example.org/floods",
          description: "Flood maps for **every** canton.",
        }),
      ],
      names,
    )

    expect(r.latest?.attachmentFolderUrl).toBe(
      "https://drive.example.org/floods",
    )
    expect(r.latest?.description).toBe("Flood maps for **every** canton.")
  })

  it("carries an absent result through as undefined", () => {
    const r = submissionVersions(
      [sub({ version: 1, result: undefined })],
      names,
    )

    expect(r.latest?.repositoryUrl).toBeUndefined()
  })
})

describe("submissionEntry", () => {
  it("is null for a team with no submissions", () => {
    expect(submissionEntry([], names)).toBeNull()
  })

  it("is null while every version is a draft", () => {
    expect(
      submissionEntry([sub({ version: 1 }), sub({ version: 2 })], names),
    ).toBeNull()
  })

  it("takes the newest final version, whatever the given order", () => {
    const e = submissionEntry(
      [
        sub({ version: 3, status: FINAL }),
        sub({ version: 1, status: FINAL }),
        sub({ version: 2, status: FINAL }),
      ],
      names,
    )

    expect(e?.id).toBe("s3")
  })

  it("ignores a draft left on top of the final version", () => {
    const e = submissionEntry(
      [sub({ version: 1, status: FINAL }), sub({ version: 2, status: DRAFT })],
      names,
    )

    expect(e?.id).toBe("s1")
    expect(e?.repositoryUrl).toBe("result-v1")
  })

  it("carries the content through, the proto's result as the repository URL", () => {
    const e = submissionEntry(
      [
        sub({
          version: 1,
          status: FINAL,
          attachmentFolderUrl: "https://drive.example.org/floods",
          description: "Flood maps for **every** canton.",
        }),
      ],
      names,
    )

    expect(e).toMatchObject({
      repositoryUrl: "result-v1",
      attachmentFolderUrl: "https://drive.example.org/floods",
      description: "Flood maps for **every** canton.",
    })
  })

  it("carries an absent result through as undefined", () => {
    const e = submissionEntry(
      [sub({ version: 1, status: FINAL, result: undefined })],
      names,
    )

    expect(e?.repositoryUrl).toBeUndefined()
  })

  it("reports who wrote the content and when, not who finalized it", () => {
    const e = submissionEntry(
      [
        sub({
          version: 1,
          status: FINAL,
          creatorId: ALICE,
          createdAt: new Date("2026-08-01T10:00:00Z"),
          modifierId: BOB,
          modifiedAt: new Date("2026-08-02T12:00:00Z"),
        }),
      ],
      names,
    )

    expect(e?.updatedBy).toBe("Alice Wonderland")
    expect(e?.updatedAt).toEqual(new Date("2026-08-01T10:00:00Z"))
  })

  it("leaves who saved it unresolved when they are no longer a member", () => {
    const e = submissionEntry(
      [sub({ version: 1, status: FINAL, creatorId: "user-departed" })],
      names,
    )

    expect(e?.updatedBy).toBeUndefined()
  })
})

describe("submissionOverview", () => {
  const user = (id: string, displayName: string): User =>
    ({ id, displayName, username: id }) as User

  /** A team with only the fields the overview reads. */
  const team = (id: string, name: string, members: User[] = []): Team =>
    ({ id, name, projectId: "project-1", members }) as unknown as Team

  const projects = new Map([
    [
      "project-1",
      { title: "Flood maps", image: "https://img.example.org/f.png" },
    ],
  ])

  it("puts teams with no entry first, then those with one, each by name", () => {
    const teams = [
      team("t-final", "Alpha"),
      team("t-none", "Zulu"),
      team("t-final-b", "Able"),
    ]
    const byTeam = new Map([
      ["t-final", [sub({ version: 1, status: FINAL })]],
      ["t-final-b", [sub({ version: 1, status: FINAL })]],
    ])

    const rows = submissionOverview(teams, byTeam, projects, names)

    expect(rows.map((r) => [r.teamName, r.standing])).toEqual([
      ["Zulu", "missing"],
      ["Able", "submitted"],
      ["Alpha", "submitted"],
    ])
  })

  // The same rule as the ballot: drafts are not an entry.
  it("counts a team holding only drafts as missing", () => {
    const rows = submissionOverview(
      [team("t1", "Drafty")],
      new Map([["t1", [sub({ version: 1 }), sub({ version: 2 })]]]),
      projects,
      names,
    )

    expect(rows[0]?.standing).toBe("missing")
    expect(rows[0]?.entry).toBeNull()
  })

  it("carries the entry and who last saved it", () => {
    const rows = submissionOverview(
      [team("t1", "Team")],
      new Map([["t1", [sub({ version: 1, status: FINAL, creatorId: BOB })]]]),
      projects,
      names,
    )

    expect(rows[0]?.entry?.id).toBe("s1")
    expect(rows[0]?.entry?.updatedBy).toBe("Bob Henderson")
  })

  it("names the project, and says so when it cannot", () => {
    const rows = submissionOverview(
      [
        team("t1", "Known"),
        { ...team("t2", "Orphan"), projectId: "gone" } as Team,
      ],
      new Map(),
      projects,
      names,
    )

    expect(rows.map((r) => [r.projectTitle, r.imageUrl])).toEqual([
      ["Flood maps", "https://img.example.org/f.png"],
      ["Unknown project", undefined],
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
      projects,
      names,
    )

    expect(rows[0]?.members).toEqual(["Amy", "anon", "Zed"])
  })
})

describe("submissionsByTeam", () => {
  it("asks once for the hackathon and groups by team, keeping the order", async () => {
    const asked: unknown[] = []
    const client = {
      listSubmissions: async (req: unknown) => {
        asked.push(req)

        return {
          submissions: [
            sub({ version: 1, teamId: "team-a" }),
            sub({ version: 2, teamId: "team-a" }),
            sub({ version: 1, teamId: "team-b" }),
          ],
        }
      },
    } as unknown as TeamServiceClient

    const byTeam = await submissionsByTeam(client, "hackathon-1")

    expect(asked).toEqual([{ hackathonId: "hackathon-1" }])
    expect(byTeam.get("team-a")?.map((s) => s.version)).toEqual([1, 2])
    expect(byTeam.get("team-b")?.map((s) => s.version)).toEqual([1])
    expect(byTeam.has("team-c")).toBe(false)
  })
})

describe("teamEntries", () => {
  /** Two teams: one with a final entry, one with only a draft. */
  const client = (listDenied = false) =>
    ({
      list: async () => {
        if (listDenied) {
          throw new ClientError(
            "/hackathon.TeamService/List",
            Status.PERMISSION_DENIED,
            "no team:read",
          )
        }

        return {
          teams: [
            { id: "team-a", name: "A", members: [] },
            { id: "team-b", name: "B", members: [] },
          ],
        }
      },
      get: async ({ teamId }: { teamId: string }) => ({
        team: {
          id: teamId,
          submissions:
            teamId === "team-a"
              ? [sub({ version: 1, status: FINAL, teamId, creatorId: BOB })]
              : [sub({ version: 1, status: DRAFT, teamId })],
        },
      }),
    }) as unknown as TeamServiceClient

  it("is undefined while team assignments are not published", async () => {
    expect(
      await teamEntries(client(true), "hackathon-1", names),
    ).toBeUndefined()
  })

  it("lists every team, with a null entry for one holding only drafts", async () => {
    const got = await teamEntries(client(), "hackathon-1", names)

    expect(got?.map((r) => [r.team.id, r.entry?.id ?? null])).toEqual([
      ["team-a", "s1"],
      ["team-b", null],
    ])
    expect(got?.[0]?.entry?.updatedBy).toBe("Bob Henderson")
  })
})
