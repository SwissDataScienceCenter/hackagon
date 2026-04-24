import { createChannel, createClientFactory, Metadata } from "nice-grpc"
import { HealthServiceDefinition } from "./generated/health/health_service"
import { UserServiceDefinition } from "./generated/user/user_service"
import type { HealthServiceClient } from "./generated/health/health_service"
import type { UserServiceClient } from "./generated/user/user_service"

const channel = createChannel("localhost:3000")

// Unauthenticated health client for the startup check in hooks.server.ts
export const healthClient = createClientFactory().create(
  HealthServiceDefinition,
  channel,
)

// Per-request authorized client bundle (created by hooks.server.ts)
export interface AuthorizedGrpc {
  user: UserServiceClient
  health: HealthServiceClient
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
    user: factory.create(UserServiceDefinition, channel),
    health: factory.create(HealthServiceDefinition, channel),
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
