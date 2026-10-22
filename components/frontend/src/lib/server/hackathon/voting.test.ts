import { describe, it, expect } from "vitest"
import { ClientError, Status } from "nice-grpc-common"
import type { TeamServiceClient } from "$lib/server/grpc/generated/hackathon/team_service"
import type { Vote } from "$lib/server/grpc/generated/vote/entities/vote"
import {
  ballotSubmissions,
  roundIsFinal,
  tallyVotes,
  voterCount,
  type SubmissionRef,
} from "./voting"

// SubmissionStatus numeric values: DRAFT=1, FINAL=2.
const FINAL = 2

const ALICE = "user-alice"
const OWN_TEAM = "team-delta"
const OTHER_TEAM = "team-epsilon"

const denied = () =>
  new ClientError(
    "/hackathon.TeamService/Get",
    Status.PERMISSION_DENIED,
    "permission denied",
  )

/**
 * A TeamServiceClient stubbed down to the two calls `ballotSubmissions` makes.
 *
 * `get`, not `listSubmissions`: the latter is scoped to the teams the viewer is
 * on (`rbac.go:216`) and no capability widens it, which left a participant with a
 * one-row ballot they were not allowed to vote in. `Get` gates on hackathon-wide
 * `hackathon:read` instead. Still keyed by team, because the refusal path has to
 * keep working — see the TODO in `voting.ts` for why the catch outlives the
 * switch.
 */
const client = (
  perTeam: Record<string, "ok" | "denied" | "boom">,
): TeamServiceClient =>
  ({
    list: async () => ({
      teams: Object.keys(perTeam).map((id) => ({
        id,
        name: id,
        projectId: `project-of-${id}`,
        members: id === OWN_TEAM ? [{ id: ALICE }] : [{ id: "user-someone" }],
      })),
    }),
    get: async ({ teamId }: { teamId: string }) => {
      if (perTeam[teamId] === "denied") throw denied()
      if (perTeam[teamId] === "boom")
        throw new ClientError(
          "/hackathon.TeamService/Get",
          Status.INTERNAL,
          "boom",
        )

      return {
        team: {
          id: teamId,
          name: teamId,
          projectId: `project-of-${teamId}`,
          members: [],
          submissions: [
            {
              id: `sub-of-${teamId}`,
              version: 1,
              status: FINAL,
              result: `result-of-${teamId}`,
              createdAt: new Date("2026-08-01T10:00:00Z"),
              modifiedAt: new Date("2026-08-01T10:00:00Z"),
              teamId,
              projectId: `project-of-${teamId}`,
              creatorId: ALICE,
            },
          ],
        },
      }
    },
  }) as unknown as TeamServiceClient

const titles = new Map([
  [`project-of-${OWN_TEAM}`, "CLI Code Generator"],
  [`project-of-${OTHER_TEAM}`, "Data Pipeline Visualizer"],
])

describe("ballotSubmissions", () => {
  it("returns every team's final submission when the viewer may read them all", async () => {
    const got = await ballotSubmissions(
      client({ [OWN_TEAM]: "ok", [OTHER_TEAM]: "ok" }),
      "hack-1",
      titles,
      ALICE,
    )

    expect(got.map((s) => s.teamId)).toEqual([OWN_TEAM, OTHER_TEAM])
    expect(got.find((s) => s.teamId === OWN_TEAM)?.isOwnTeam).toBe(true)
    expect(got.find((s) => s.teamId === OTHER_TEAM)?.isOwnTeam).toBe(false)
  })

  // The one that used to 500 the whole results page: awaiting a refusal
  // unguarded rejected the enclosing Promise.all. No longer the participant case
  // — `Get` is readable hackathon-wide — but the guard has to survive the day
  // `Get` starts enforcing `submission:read`.
  // TODO(backend: submission-cross-team-read) — delete with the catch it covers.
  it("skips a team whose submissions the viewer may not read, rather than throwing", async () => {
    const got = await ballotSubmissions(
      client({ [OWN_TEAM]: "ok", [OTHER_TEAM]: "denied" }),
      "hack-1",
      titles,
      ALICE,
    )

    expect(got.map((s) => s.teamId)).toEqual([OWN_TEAM])
  })

  it("returns nothing rather than throwing when every team is refused", async () => {
    const got = await ballotSubmissions(
      client({ [OWN_TEAM]: "denied", [OTHER_TEAM]: "denied" }),
      "hack-1",
      titles,
      ALICE,
    )

    expect(got).toEqual([])
  })

  // Only PERMISSION_DENIED is a normal state to absorb. Swallowing the rest
  // would turn a broken backend into a silently empty ballot.
  it("still propagates a failure that is not a permission denial", async () => {
    await expect(
      ballotSubmissions(
        client({ [OWN_TEAM]: "ok", [OTHER_TEAM]: "boom" }),
        "hack-1",
        titles,
        ALICE,
      ),
    ).rejects.toThrow("boom")
  })
})

/** A stored vote: one voter, one entry, one method's payload. */
const vote = (
  voterId: string,
  payload: Pick<Vote, "singleChoice" | "points" | "ranked">,
): Vote => ({
  id: `${voterId}-${JSON.stringify(payload)}`,
  categoryId: "cat-1",
  voterId,
  createdAt: 100,
  modifiedAt: 100,
  ...payload,
})
const pick = (voterId: string, submissionId: string) =>
  vote(voterId, { singleChoice: { submissionId } })
const give = (voterId: string, submissionId: string, points: number) =>
  vote(voterId, { points: { submissionId, points } })

const entries = new Map<string, SubmissionRef>([
  ["sub-a", { projectTitle: "Alpha", teamName: "Team A", teamId: "team-a" }],
  ["sub-b", { projectTitle: "Bravo", teamName: "Team B", teamId: "team-b" }],
  ["sub-c", { projectTitle: "Charlie", teamName: "Team C", teamId: "team-c" }],
])

describe("voterCount", () => {
  it("counts people, not the rows one points ballot is stored as", () => {
    expect(
      voterCount([
        give("u1", "sub-a", 4),
        give("u1", "sub-b", 6),
        give("u2", "sub-a", 10),
      ]),
    ).toBe(2)
  })
})

describe("roundIsFinal", () => {
  it("is final once every category anyone voted in has results", () => {
    expect(
      roundIsFinal([
        { voterCount: 3, resultCount: 2 },
        { voterCount: 1, resultCount: 1 },
      ]),
    ).toBe(true)
  })

  it("is not final while a voted-in category has no results", () => {
    expect(
      roundIsFinal([
        { voterCount: 3, resultCount: 2 },
        { voterCount: 1, resultCount: 0 },
      ]),
    ).toBe(false)
  })

  // Nothing to place, so it must not keep the round from being final.
  it("ignores a category nobody voted in", () => {
    expect(
      roundIsFinal([
        { voterCount: 3, resultCount: 2 },
        { voterCount: 0, resultCount: 0 },
      ]),
    ).toBe(true)
  })

  it("is not final when nobody has voted at all", () => {
    expect(roundIsFinal([{ voterCount: 0, resultCount: 0 }])).toBe(false)
    expect(roundIsFinal([])).toBe(false)
  })
})

describe("tallyVotes", () => {
  it("counts one per vote for single choice, highest first", () => {
    const got = tallyVotes(
      "single_choice",
      [pick("u1", "sub-b"), pick("u2", "sub-b"), pick("u3", "sub-a")],
      entries,
    )
    expect(got.map((r) => [r.projectTitle, r.score, r.rank])).toEqual([
      ["Bravo", 2, 1],
      ["Alpha", 1, 2],
    ])
  })

  it("sums points per entry", () => {
    const got = tallyVotes(
      "points",
      [give("u1", "sub-a", 4), give("u1", "sub-b", 6), give("u2", "sub-a", 10)],
      entries,
    )
    expect(got.map((r) => [r.projectTitle, r.score])).toEqual([
      ["Alpha", 14],
      ["Bravo", 6],
    ])
  })

  // The same rule `SuggestResults` applies, so the preview and the saved
  // placements agree: equal scores share a rank and the next one skips.
  it("shares a rank between equal scores and skips the next", () => {
    const got = tallyVotes(
      "single_choice",
      [
        pick("u1", "sub-b"),
        pick("u2", "sub-a"),
        pick("u3", "sub-c"),
        pick("u4", "sub-c"),
      ],
      entries,
    )
    expect(got.map((r) => [r.projectTitle, r.rank])).toEqual([
      ["Charlie", 1],
      ["Alpha", 2],
      ["Bravo", 2],
    ])
  })

  it("scores ranked votes as a Borda count over the entries that got a vote", () => {
    const got = tallyVotes(
      "ranked",
      [
        vote("u1", { ranked: { submissionId: "sub-a", rank: 1 } }),
        vote("u1", { ranked: { submissionId: "sub-b", rank: 2 } }),
      ],
      entries,
    )
    // Two entries voted on, so rank 1 is worth 2 - 1 and rank 2 is worth 0.
    expect(got.map((r) => [r.projectTitle, r.score])).toEqual([
      ["Alpha", 1],
      ["Bravo", 0],
    ])
  })

  it("names an entry it cannot resolve rather than dropping its votes", () => {
    const got = tallyVotes("single_choice", [pick("u1", "sub-gone")], entries)
    expect(got).toEqual([
      {
        submissionId: "sub-gone",
        projectTitle: "Unknown submission",
        teamName: "",
        teamId: undefined,
        score: 1,
        rank: 1,
      },
    ])
  })
})
