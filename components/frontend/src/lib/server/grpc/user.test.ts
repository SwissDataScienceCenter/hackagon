import { describe, it, expect, beforeAll, afterAll } from "vitest"
import * as grpc from "@grpc/grpc-js"
import {
  UserClient,
  UserService,
  type UserListResponse,
  type UserServer,
} from "./generated/user"

describe("user.proto gRPC contract", () => {
  let server: grpc.Server
  let client: UserClient

  const sampleUsers = [
    {
      name: "Alice",
      keycloakId: "kc-001",
      createdAt: new Date("2025-01-15T10:00:00Z"),
    },
    {
      name: "Bob",
      keycloakId: "kc-002",
      createdAt: new Date("2025-06-20T14:30:00Z"),
    },
  ]

  beforeAll(async () => {
    server = new grpc.Server()
    const impl: UserServer = {
      list: (_call, callback) => {
        callback(null, { users: sampleUsers })
      },
    }
    server.addService(UserService, impl)

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

    client = new UserClient(
      `127.0.0.1:${port}`,
      grpc.credentials.createInsecure(),
    )
  })

  afterAll(() => {
    client?.close()
    server?.forceShutdown()
  })

  it("should produce a valid User service descriptor from generated code", () => {
    expect(client.list).toBeDefined()
    expect(typeof client.list).toBe("function")
  })

  it("should receive a UserListResponse with users array", async () => {
    const response = await new Promise<UserListResponse>((resolve, reject) => {
      client.list({}, (err, res) => {
        if (err) reject(err)
        else resolve(res)
      })
    })
    expect(response.users).toHaveLength(2)
    expect(response.users[0]!.name).toBe("Alice")
    expect(response.users[0]!.keycloakId).toBe("kc-001")
    expect(response.users[0]!.createdAt).toEqual(
      new Date("2025-01-15T10:00:00Z"),
    )
    expect(response.users[1]!.name).toBe("Bob")
    expect(response.users[1]!.keycloakId).toBe("kc-002")
  })

  it("should propagate gRPC errors to the client", async () => {
    const errServer = new grpc.Server()
    const errImpl: UserServer = {
      list: (_call, callback) => {
        callback({
          code: grpc.status.UNAVAILABLE,
          message: "backend down",
        })
      },
    }
    errServer.addService(UserService, errImpl)

    const errPort = await new Promise<number>((resolve, reject) => {
      errServer.bindAsync(
        "127.0.0.1:0",
        grpc.ServerCredentials.createInsecure(),
        (err, p) => (err ? reject(err) : resolve(p)),
      )
    })

    const errClient = new UserClient(
      `127.0.0.1:${errPort}`,
      grpc.credentials.createInsecure(),
    )

    await expect(
      new Promise((resolve, reject) => {
        errClient.list({}, (err, res) => {
          if (err) reject(err)
          else resolve(res)
        })
      }),
    ).rejects.toMatchObject({ code: grpc.status.UNAVAILABLE })

    errClient.close()
    errServer.forceShutdown()
  })
})
