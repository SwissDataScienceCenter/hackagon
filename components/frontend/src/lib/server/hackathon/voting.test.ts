import { describe, it, expect } from "vitest"
import { ClientError, Status } from "nice-grpc-common"
import type { TeamServiceClient } from "$lib/server/grpc/generated/hackathon/team_service"
import { ballotSubmissions } from "./voting"

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
