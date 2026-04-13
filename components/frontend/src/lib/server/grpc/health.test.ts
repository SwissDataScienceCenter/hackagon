import { describe, it, expect, beforeAll, afterAll } from "vitest"
import * as grpc from "@grpc/grpc-js"
import {
  HealthClient,
  HealthService,
  type HealthCheckResponse,
  type HealthServer,
} from "./generated/health"

describe("health.proto gRPC contract", () => {
  let server: grpc.Server
  let client: HealthClient

  beforeAll(async () => {
    server = new grpc.Server()
    const impl: HealthServer = {
      check: (_call, callback) => {
        callback(null, { message: "Service is healthy" })
      },
    }
    server.addService(HealthService, impl)

    const port = await new Promise<number>((resolve, reject) => {
      server.bindAsync(
        "127.0.0.1:0",
        grpc.ServerCredentials.createInsecure(),
        (err, assignedPort) => {
          if (err) reject(err)
          else resolve(assignedPort)
        },
      )
    })

    client = new HealthClient(
      `127.0.0.1:${port}`,
      grpc.credentials.createInsecure(),
    )
  })

  afterAll(() => {
    client?.close()
    server?.forceShutdown()
  })

  it("should produce a valid Health service descriptor from generated code", () => {
    expect(client.check).toBeDefined()
    expect(typeof client.check).toBe("function")
  })

  it("should receive a HealthCheckResponse with message field", async () => {
    const response = await new Promise<HealthCheckResponse>(
      (resolve, reject) => {
        client.check({}, (err, res) => {
          if (err) reject(err)
          else resolve(res)
        })
      },
    )
    expect(response).toEqual({ message: "Service is healthy" })
  })

  it("should propagate gRPC errors to the client", async () => {
    const errServer = new grpc.Server()
    const errImpl: HealthServer = {
      check: (_call, callback) => {
        callback({
          code: grpc.status.UNAVAILABLE,
          message: "backend down",
        })
      },
    }
    errServer.addService(HealthService, errImpl)

    const errPort = await new Promise<number>((resolve, reject) => {
      errServer.bindAsync(
        "127.0.0.1:0",
        grpc.ServerCredentials.createInsecure(),
        (err, p) => (err ? reject(err) : resolve(p)),
      )
    })

    const errClient = new HealthClient(
      `127.0.0.1:${errPort}`,
      grpc.credentials.createInsecure(),
    )

    await expect(
      new Promise((resolve, reject) => {
        errClient.check({}, (err, res) => {
          if (err) reject(err)
          else resolve(res)
        })
      }),
    ).rejects.toMatchObject({ code: grpc.status.UNAVAILABLE })

    errClient.close()
    errServer.forceShutdown()
  })
})
