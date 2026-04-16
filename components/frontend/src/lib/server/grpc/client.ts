import { createChannel, createClientFactory, Metadata } from "nice-grpc"
import { HealthDefinition } from "./generated/health"
import { UserDefinition } from "./generated/user"
import type { HealthClient } from "./generated/health"
import type { UserClient } from "./generated/user"

const channel = createChannel("localhost:3000")

// Unauthenticated health client for the startup check in hooks.server.ts
export const healthClient = createClientFactory().create(
  HealthDefinition,
  channel,
)

// Per-request authorized client bundle (created by hooks.server.ts)
export interface AuthorizedGrpc {
  user: UserClient
  health: HealthClient
}

export function createAuthorizedGrpc(accessToken: string): AuthorizedGrpc {
  const factory = createClientFactory().use((call, options) =>
    call.next(call.request, {
      ...options,
      metadata: Metadata(options.metadata).set(
        "Authorization",
        `Bearer ${accessToken}`,
      ),
    }),
  )

  return {
    user: factory.create(UserDefinition, channel),
    health: factory.create(HealthDefinition, channel),
  }
}

export function requireGrpc(grpc: AuthorizedGrpc | undefined): AuthorizedGrpc {
  if (!grpc) {
    throw new Error(
      "gRPC clients not initialized. Is this route public when it should be protected?",
    )
  }
  return grpc
}
