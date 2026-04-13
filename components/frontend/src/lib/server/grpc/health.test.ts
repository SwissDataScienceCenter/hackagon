import { describe, it, expect, beforeAll, afterAll } from "vitest"
import * as grpc from "@grpc/grpc-js"
import * as protoLoader from "@grpc/proto-loader"
import { join } from "path"

const PROTO_PATH = join(process.cwd(), "src/lib/server/grpc/health.proto")

describe("health.proto gRPC contract", () => {
  let server: grpc.Server
  let client: any

  beforeAll(async () => {
    const packageDef = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    })
    const proto = grpc.loadPackageDefinition(packageDef) as any

    server = new grpc.Server()
    server.addService(proto.health.Health.service, {
      check: (_call: any, callback: any) => {
        callback(null, { message: "Service is healthy" })
      },
    })

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

    client = new proto.health.Health(
      `127.0.0.1:${port}`,
      grpc.credentials.createInsecure(),
    )
  })

  afterAll(() => {
    client?.close()
    server?.forceShutdown()
  })

  it("should load the proto and produce a valid Health service descriptor", () => {
    expect(client.check).toBeDefined()
    expect(typeof client.check).toBe("function")
  })

  it("should receive a HealthCheckResponse with message field", async () => {
    const response = await new Promise<any>((resolve, reject) => {
      client.check({}, (err: any, res: any) => {
        if (err) reject(err)
        else resolve(res)
      })
    })
    expect(response).toEqual({ message: "Service is healthy" })
  })

  it("should propagate gRPC errors to the client", async () => {
    const errProto = grpc.loadPackageDefinition(
      protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      }),
    ) as any

    const errServer = new grpc.Server()
    errServer.addService(errProto.health.Health.service, {
      check: (_call: any, callback: any) => {
        callback({
          code: grpc.status.UNAVAILABLE,
          message: "backend down",
        })
      },
    })

    const errPort = await new Promise<number>((resolve, reject) => {
      errServer.bindAsync(
        "127.0.0.1:0",
        grpc.ServerCredentials.createInsecure(),
        (err, p) => (err ? reject(err) : resolve(p)),
      )
    })

    const errClient = new errProto.health.Health(
      `127.0.0.1:${errPort}`,
      grpc.credentials.createInsecure(),
    )

    await expect(
      new Promise((resolve, reject) => {
        errClient.check({}, (err: any, res: any) => {
          if (err) reject(err)
          else resolve(res)
        })
      }),
    ).rejects.toMatchObject({ code: grpc.status.UNAVAILABLE })

    errClient.close()
    errServer.forceShutdown()
  })
})
