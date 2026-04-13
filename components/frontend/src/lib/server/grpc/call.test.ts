import { describe, it, expect } from "vitest"
import { status as grpcStatus } from "@grpc/grpc-js"
import type { ServiceError } from "@grpc/grpc-js"
import { callGrpc } from "./call"

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
