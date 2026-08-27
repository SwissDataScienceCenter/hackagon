import { describe, it, expect } from "vitest"
import { listVisibleTeams } from "./teams"
import type { TeamServiceClient } from "$lib/server/grpc/generated/hackathon/team_service"
import { ClientError, Status } from "nice-grpc-common"

/** A client whose `list` does whatever the test says. Nothing else is called. */
function client(list: () => unknown): TeamServiceClient {
  return { list } as unknown as TeamServiceClient
}

function refusal(code: Status) {
  return new ClientError("/hackathon.TeamService/List", code, "nope")
}

describe("listVisibleTeams", () => {
  it("returns the teams when the read is allowed", async () => {
    const teams = [{ id: "t1" }, { id: "t2" }]
    const result = await listVisibleTeams(
      client(async () => ({ teams })),
      "h1",
    )
    expect(result).toEqual(teams)
  })

  // The distinction the callers exist for: a page may say "nobody is on a team
  // yet" here, and may not say it below.
  it("returns an empty list when there are no teams", async () => {
    expect(
      await listVisibleTeams(
        client(async () => ({ teams: [] })),
        "h1",
      ),
    ).toEqual([])
  })

  it("returns undefined when assignments are not published", async () => {
    expect(
      await listVisibleTeams(
        client(async () => {
          throw refusal(Status.PERMISSION_DENIED)
        }),
        "h1",
      ),
    ).toBeUndefined()
  })

  // Everything else is a real problem and stays one. Swallowing it here would
  // hide it from all four callers at once, and each of them reports it.
  it.each([
    ["NotFound", Status.NOT_FOUND],
    ["Internal", Status.INTERNAL],
    ["Unavailable", Status.UNAVAILABLE],
  ])("rethrows %s", async (_name, code) => {
    await expect(
      listVisibleTeams(
        client(async () => {
          throw refusal(code)
        }),
        "h1",
      ),
    ).rejects.toThrow()
  })

  it("rethrows a non-gRPC failure", async () => {
    await expect(
      listVisibleTeams(
        client(async () => {
          throw new Error("socket closed")
        }),
        "h1",
      ),
    ).rejects.toThrow("socket closed")
  })
})
