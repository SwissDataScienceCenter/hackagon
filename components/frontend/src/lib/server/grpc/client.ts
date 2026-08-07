import { createChannel, createClientFactory, Metadata } from "nice-grpc"
import {
  HealthServiceDefinition,
  type HealthServiceClient,
} from "./health_client"
import { UserServiceDefinition } from "./generated/user/user_service"
import { HackathonServiceDefinition } from "./generated/hackathon/hackathon_service"
import { TeamServiceDefinition } from "./generated/hackathon/team_service"
import { PageServiceDefinition } from "./generated/hackathon/page_service"
import { ProjectServiceDefinition } from "./generated/hackathon/project_service"
import { PhaseServiceDefinition } from "./generated/hackathon/phase_service"
import { TrackServiceDefinition } from "./generated/hackathon/track_service"
import { VoteServiceDefinition } from "./generated/vote/vote_service"
import type { UserServiceClient } from "./generated/user/user_service"
import type { HackathonServiceClient } from "./generated/hackathon/hackathon_service"
import type { TeamServiceClient } from "./generated/hackathon/team_service"
import type { PageServiceClient } from "./generated/hackathon/page_service"
import type { ProjectServiceClient } from "./generated/hackathon/project_service"
import type { PhaseServiceClient } from "./generated/hackathon/phase_service"
import type { TrackServiceClient } from "./generated/hackathon/track_service"
import type { VoteServiceClient } from "./generated/vote/vote_service"
import { ConfigLoader } from "$lib/server/settings"

// Lazy channel getter — reads the backend address from the loaded config.
// The config is populated in hooks.server.ts init() before any request runs,
// so the first access always sees a valid value.
let _channel: ReturnType<typeof createChannel> | undefined

function getChannel(): ReturnType<typeof createChannel> {
  if (!_channel) {
    const cfg = ConfigLoaderInstance.get()
    _channel = createChannel(`${cfg.backend.hostname}:${cfg.backend.port}`)
  }
  return _channel
}

// Placeholder — replaced at runtime by hooks.server.ts init().
// Initialized to a no-op so the module can be imported without error.
let ConfigLoaderInstance: ConfigLoader = new (class {
  get() {
    return { backend: { hostname: "localhost", port: 3000 } }
  }
})() as unknown as ConfigLoader

/** Called once at startup to wire the real config loader. */
export function setConfigLoader(loader: ConfigLoader) {
  ConfigLoaderInstance = loader
  // Reset cached channel so it picks up the real config.
  _channel = undefined
}

// Unauthenticated health client for the startup check in hooks.server.ts
export { healthClient } from "./health_client"

// Unauthenticated hackathon client for public pages (List endpoint is skipAuth).
// Created fresh per call so it always picks up the current channel (which
// reflects the config loaded at startup).
export function publicHackathonClient() {
  return createClientFactory().create(HackathonServiceDefinition, getChannel())
}

// Per-request authorized client bundle (created by hooks.server.ts)
export interface AuthorizedGrpc {
  user: UserServiceClient
  health: HealthServiceClient
  hackathon: HackathonServiceClient
  // Teams are the one participant-facing collection `hackathon.get` does not
  // return, so they need their own client.
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
  // Tracks arrive nested in `hackathon.get` too, so the propose/edit-project
  // pickers and the Manage Tracks list all read from there. This client is for
  // the organizer write path — Create, Edit, Delete — plus Get, same reason as
  // `phase`: the edit form re-reads the single track rather than trusting the
  // layout's cached tree.
  track: TrackServiceClient
  // Voting is the one feature `hackathon.get` knows nothing about — it returns
  // no categories, no votes and no results — so every read path here goes
  // through this client, not just the writes. `vote` is also its own proto
  // package (`vote.VoteService`, not `hackathon.*`), hence the different
  // generated path.
  vote: VoteServiceClient
}

export function createAuthorizedGrpc(
  accessToken: string,
  backendAddress: string,
): AuthorizedGrpc {
  const channel = createChannel(backendAddress)
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
    health: factory.create(HealthServiceDefinition, channel), // standard grpc.health.v1
    hackathon: factory.create(HackathonServiceDefinition, channel),
    team: factory.create(TeamServiceDefinition, channel),
    page: factory.create(PageServiceDefinition, channel),
    project: factory.create(ProjectServiceDefinition, channel),
    phase: factory.create(PhaseServiceDefinition, channel),
    track: factory.create(TrackServiceDefinition, channel),
    vote: factory.create(VoteServiceDefinition, channel),
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
