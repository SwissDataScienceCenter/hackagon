import { createChannel, createClientFactory, Metadata } from "nice-grpc"
import { HealthServiceDefinition } from "./generated/health/health_service"
import { UserServiceDefinition } from "./generated/user/user_service"
import { HackathonServiceDefinition } from "./generated/hackathon/hackathon_service"
import { TeamServiceDefinition } from "./generated/hackathon/team_service"
import type { HealthServiceClient } from "./generated/health/health_service"
import type { UserServiceClient } from "./generated/user/user_service"
import type { HackathonServiceClient } from "./generated/hackathon/hackathon_service"
import type { TeamServiceClient } from "./generated/hackathon/team_service"

const channel = createChannel("localhost:3000")

// Unauthenticated health client for the startup check in hooks.server.ts
export const healthClient = createClientFactory().create(
  HealthServiceDefinition,
  channel,
)

// Unauthenticated hackathon client for public pages (List endpoint is skipAuth)
export const publicHackathonClient = createClientFactory().create(
  HackathonServiceDefinition,
  channel,
)

// Per-request authorized client bundle (created by hooks.server.ts)
export interface AuthorizedGrpc {
  user: UserServiceClient
  health: HealthServiceClient
  hackathon: HackathonServiceClient
  // Teams are the one participant-facing collection `hackathon.get` does not
  // return, so they need their own client. Tracks, projects, pages and phases
  // arrive nested in the Get response — no client of their own on purpose.
  team: TeamServiceClient
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
    hackathon: factory.create(HackathonServiceDefinition, channel),
    team: factory.create(TeamServiceDefinition, channel),
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
