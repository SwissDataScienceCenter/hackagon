import { describe, it, expect, vi } from "vitest"
import { ClientError, Status } from "nice-grpc-common"
import { leaveHackathon } from "./leave"

const HACKATHON = "hackathon-1"

/** A client whose `leave` either succeeds or throws `error`. */
function client(error?: unknown) {
  return {
    leave: vi.fn(async () => {
      if (error) throw error
      return {}
    }),
  }
}

function grpcError(code: Status) {
  return new ClientError("/hackathon.HackathonService/Leave", code, "")
}

describe("leaveHackathon", () => {
  it("leaves the hackathon it is given", async () => {
    const c = client()

    expect(await leaveHackathon(c, HACKATHON)).toBeUndefined()
    expect(c.leave).toHaveBeenCalledWith({ hackathonId: HACKATHON })
  })

  it("counts somebody who is already out as out", async () => {
    expect(
      await leaveHackathon(client(grpcError(Status.NOT_FOUND)), HACKATHON),
    ).toBeUndefined()
  })

  it("refuses a finished hackathon with a conflict", async () => {
    const refusal = await leaveHackathon(
      client(grpcError(Status.FAILED_PRECONDITION)),
      HACKATHON,
    )

    expect(refusal?.status).toBe(409)
    expect(refusal?.message).toMatch(/already finished/)
  })

  it("asks an expired session to sign in again", async () => {
    const refusal = await leaveHackathon(
      client(grpcError(Status.UNAUTHENTICATED)),
      HACKATHON,
    )

    expect(refusal?.status).toBe(401)
  })

  it("lets any other failure through", async () => {
    await expect(
      leaveHackathon(client(grpcError(Status.UNAVAILABLE)), HACKATHON),
    ).rejects.toBeInstanceOf(ClientError)
    await expect(
      leaveHackathon(client(new Error("boom")), HACKATHON),
    ).rejects.toThrow("boom")
  })
})
