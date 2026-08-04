import { createChannel, createClientFactory, Metadata } from "nice-grpc"
import type { Channel } from "nice-grpc"
import { sharedConfigLoader } from "$lib/server/settings"
import { HealthServiceDefinition } from "./generated/health/health_service"
import { UserServiceDefinition } from "./generated/user/user_service"
import { HackathonServiceDefinition } from "./generated/hackathon/hackathon_service"
import { TeamServiceDefinition } from "./generated/hackathon/team_service"
import { PageServiceDefinition } from "./generated/hackathon/page_service"
import { SitePageServiceDefinition } from "./generated/site/site_page_service"
import type { HealthServiceClient } from "./generated/health/health_service"
import type { UserServiceClient } from "./generated/user/user_service"
import type { HackathonServiceClient } from "./generated/hackathon/hackathon_service"
import type { TeamServiceClient } from "./generated/hackathon/team_service"
import type { PageServiceClient } from "./generated/hackathon/page_service"
import type { SitePageServiceClient } from "./generated/site/site_page_service"

let channel: Channel | undefined

// The backend address comes from the validated config, which hooks.server.ts
// only loads after this module has been imported — hence the lazy channel.
// Every client below is built through it, so none of them can capture an
// address before the config has been read and validated.
function getChannel(): Channel {
  if (!channel) {
    const { hostname, port } = sharedConfigLoader.get().backend
    channel = createChannel(`${hostname}:${port}`)
  }
  return channel
}

// Unauthenticated health client for the startup check in hooks.server.ts
export function healthClient(): HealthServiceClient {
  return createClientFactory().create(HealthServiceDefinition, getChannel())
}

// Unauthenticated hackathon client for public pages (List endpoint is skipAuth)
export function publicHackathonClient(): HackathonServiceClient {
  return createClientFactory().create(HackathonServiceDefinition, getChannel())
}

// Unauthenticated page client for public hackathon pages (winners, wrap-up
// posts). The backend serves pages of PUBLIC hackathons to everyone.
export function publicPageClient(): PageServiceClient {
  return createClientFactory().create(PageServiceDefinition, getChannel())
}

// Unauthenticated site-page client: About/Privacy/Terms are reachable from the
// footer before anyone logs in, so published pages are served to everyone.
export function publicSitePageClient(): SitePageServiceClient {
  return createClientFactory().create(SitePageServiceDefinition, getChannel())
}

// Per-request authorized client bundle (created by hooks.server.ts)
export interface AuthorizedGrpc {
  user: UserServiceClient
  health: HealthServiceClient
  hackathon: HackathonServiceClient
  team: TeamServiceClient
  sitePage: SitePageServiceClient
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
    user: factory.create(UserServiceDefinition, getChannel()),
    health: factory.create(HealthServiceDefinition, getChannel()),
    hackathon: factory.create(HackathonServiceDefinition, getChannel()),
    team: factory.create(TeamServiceDefinition, getChannel()),
    sitePage: factory.create(SitePageServiceDefinition, getChannel()),
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
