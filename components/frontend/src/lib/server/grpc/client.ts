import { createChannel, createClientFactory, Metadata } from "nice-grpc"
import { HealthServiceDefinition } from "./generated/health/health_service"
import { UserServiceDefinition } from "./generated/user/user_service"
import { HackathonServiceDefinition } from "./generated/hackathon/hackathon_service"
import { TeamServiceDefinition } from "./generated/hackathon/team_service"
import { PageServiceDefinition } from "./generated/hackathon/page_service"
import { ProjectServiceDefinition } from "./generated/hackathon/project_service"
import { PhaseServiceDefinition } from "./generated/hackathon/phase_service"
import type { HealthServiceClient } from "./generated/health/health_service"
import type { UserServiceClient } from "./generated/user/user_service"
import type { HackathonServiceClient } from "./generated/hackathon/hackathon_service"
import type { TeamServiceClient } from "./generated/hackathon/team_service"
import type { PageServiceClient } from "./generated/hackathon/page_service"
import type { ProjectServiceClient } from "./generated/hackathon/project_service"
import type { PhaseServiceClient } from "./generated/hackathon/phase_service"

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
  // return, so they need their own client. Tracks arrive nested in the Get
  // response — no client of their own on purpose.
  team: TeamServiceClient
  // Pages have their own client despite `hackathon.get` nesting them, because
  // that response includes pages with `visible: false`, while PageService.List
  // and Get filter and deny them. Page content therefore always comes from
  // PageService, so the backend stays the one deciding what a member may read.
  page: PageServiceClient
  // Projects arrive nested in `hackathon.get` too, so every read path still
  // uses that. This client exists for the write path only — Propose and Edit,
  // which have no equivalent anywhere else.
  project: ProjectServiceClient
  // Phases arrive nested in `hackathon.get` as well, so the participant-facing
  // timeline needs no client. This one is for the organizer write path — Create,
  // Edit, Delete — plus Get, which re-reads a single phase after a write rather
  // than trusting the layout's cached tree.
  phase: PhaseServiceClient
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
    page: factory.create(PageServiceDefinition, channel),
    project: factory.create(ProjectServiceDefinition, channel),
    phase: factory.create(PhaseServiceDefinition, channel),
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
