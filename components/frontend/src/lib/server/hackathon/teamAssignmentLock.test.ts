import { describe, it, expect } from "vitest"
import { assignmentLockReasons, lockReasons } from "./teamAssignmentLock"
import { Capability } from "$lib/server/grpc/generated/hackathon/entities/capability"
import type { HackathonState } from "$lib/server/grpc/generated/hackathon/entities/hackathon_state"
import type { TeamServiceClient } from "$lib/server/grpc/generated/hackathon/team_service"
import { ClientError, Status } from "nice-grpc-common"

/**
 * A client whose `listSubmissions` answers for hackathon `h1` only. Nothing
 * else is called.
 */
function client(count: number | "refuse"): TeamServiceClient {
  return {
    listSubmissions: async ({ hackathonId }: { hackathonId?: string }) => {
      if (count === "refuse") {
        throw new ClientError(
          "/hackathon.TeamService/ListSubmissions",
          Status.PERMISSION_DENIED,
          "nope",
        )
      }
      const n = hackathonId === "h1" ? count : 0

      return { submissions: Array.from({ length: n }, () => ({})) }
    },
  } as unknown as TeamServiceClient
}

function state(viewTeams: boolean): HackathonState {
  return {
    capabilities: [
      { capability: Capability.CAPABILITY_VIEW_TEAMS, enabled: viewTeams },
    ],
  } as unknown as HackathonState
}

describe("assignmentLockReasons", () => {
  it("is open with no submissions and teams not published", async () => {
    expect(await assignmentLockReasons(client(0), "h1", state(false))).toEqual(
      [],
    )
  })

  it("counts every submission in the hackathon", async () => {
    expect(await assignmentLockReasons(client(3), "h1", state(false))).toEqual([
      "3 submissions exist",
    ])
  })

  it("locks on published teams alone", async () => {
    expect(await assignmentLockReasons(client(0), "h1", state(true))).toEqual([
      "teams are published",
    ])
  })

  it("locks when submissions cannot be checked, rather than guess open", async () => {
    expect(
      await assignmentLockReasons(client("refuse"), "h1", state(false)),
    ).toEqual(["submissions could not be checked"])
  })

  it("reads a hackathon with no state row as not published", async () => {
    expect(await assignmentLockReasons(client(0), "h1", undefined)).toEqual([])
  })
})

describe("lockReasons", () => {
  it("names both reasons, submissions first", () => {
    expect(lockReasons({ submissions: 1, published: true })).toEqual([
      "1 submission exists",
      "teams are published",
    ])
  })
})
