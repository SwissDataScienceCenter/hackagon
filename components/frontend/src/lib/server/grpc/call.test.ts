import { describe, it, expect } from "vitest"
import { status as grpcStatus } from "@grpc/grpc-js"
import type { ServiceError } from "@grpc/grpc-js"
import { callGrpc, grpcStatusToHttp, apiHandler } from "./call"
import { json } from "@sveltejs/kit"
import type { RequestEvent } from "@sveltejs/kit"

describe("callGrpc", () => {
  it("should resolve with the response on success", async () => {
    const result = await callGrpc<{ value: string }>((cb) =>
      cb(null, { value: "ok" }),
    )
    expect(result).toEqual({ value: "ok" })
  })

  it("should reject with ServiceError on failure", async () => {
    const grpcErr = {
      code: grpcStatus.NOT_FOUND,
      message: "not found",
    } as ServiceError

    await expect(
      callGrpc<string>((cb) => cb(grpcErr, "" as never)),
    ).rejects.toMatchObject({
      code: grpcStatus.NOT_FOUND,
      message: "not found",
    })
  })
})

describe("grpcStatusToHttp", () => {
  it.each([
    [grpcStatus.INVALID_ARGUMENT, 400],
    [grpcStatus.UNAUTHENTICATED, 401],
    [grpcStatus.PERMISSION_DENIED, 403],
    [grpcStatus.NOT_FOUND, 404],
    [grpcStatus.ALREADY_EXISTS, 409],
    [grpcStatus.FAILED_PRECONDITION, 412],
    [grpcStatus.RESOURCE_EXHAUSTED, 429],
    [grpcStatus.CANCELLED, 499],
    [grpcStatus.UNAVAILABLE, 503],
    [grpcStatus.DEADLINE_EXCEEDED, 504],
  ])("should map gRPC status %i to HTTP %i", (grpc, http) => {
    expect(grpcStatusToHttp(grpc)).toBe(http)
  })

  it("should default to 500 for unknown codes", () => {
    expect(grpcStatusToHttp(grpcStatus.INTERNAL)).toBe(500)
    expect(grpcStatusToHttp(grpcStatus.DATA_LOSS)).toBe(500)
  })

  it("should default to 500 for undefined code", () => {
    expect(grpcStatusToHttp(undefined)).toBe(500)
  })
})

describe("apiHandler", () => {
  function fakeEvent(path = "/api/test"): RequestEvent {
    return {
      url: new URL(`http://localhost${path}`),
    } as unknown as RequestEvent
  }

  it("should pass through the inner handler's response on success", async () => {
    const handler = apiHandler(async () => json({ ok: true }))
    const response = await handler(fakeEvent())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it("should catch gRPC errors and map to correct HTTP status", async () => {
    const handler = apiHandler(async () => {
      throw { code: grpcStatus.NOT_FOUND, message: "user not found" }
    })
    const response = await handler(fakeEvent())
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "user not found" })
  })

  it("should return 503 for UNAVAILABLE", async () => {
    const handler = apiHandler(async () => {
      throw { code: grpcStatus.UNAVAILABLE, message: "backend down" }
    })
    const response = await handler(fakeEvent())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "backend down" })
  })

  it("should return 500 for unknown errors", async () => {
    const handler = apiHandler(async () => {
      throw { message: "something broke" }
    })
    const response = await handler(fakeEvent())
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "something broke" })
  })
})
