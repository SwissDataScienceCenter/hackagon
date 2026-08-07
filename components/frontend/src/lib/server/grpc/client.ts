import { createChannel, createClientFactory, Metadata } from "nice-grpc"
import { HealthServiceDefinition } from "./generated/health/health_service"
import { UserServiceDefinition } from "./generated/user/user_service"
import { HackathonServiceDefinition } from "./generated/hackathon/hackathon_service"
import { TeamServiceDefinition } from "./generated/hackathon/team_service"
import { PageServiceDefinition } from "./generated/hackathon/page_service"
import { ProjectServiceDefinition } from "./generated/hackathon/project_service"
import { PhaseServiceDefinition } from "./generated/hackathon/phase_service"
import { TrackServiceDefinition } from "./generated/hackathon/track_service"
import { ConfigServiceDefinition } from "./generated/hackathon/config_service"
import { PrizeServiceDefinition } from "./generated/hackathon/prize_service"
import { VoteServiceDefinition } from "./generated/vote/vote_service"
import { SitePageServiceDefinition } from "./generated/site/site_page_service"
import { StorageServiceDefinition } from "./generated/storage/storage_service"
import type { HealthServiceClient } from "./generated/health/health_service"
import type { UserServiceClient } from "./generated/user/user_service"
import type { HackathonServiceClient } from "./generated/hackathon/hackathon_service"
import type { TeamServiceClient } from "./generated/hackathon/team_service"
import type { PageServiceClient } from "./generated/hackathon/page_service"
import type { ProjectServiceClient } from "./generated/hackathon/project_service"
import type { PhaseServiceClient } from "./generated/hackathon/phase_service"
import type { TrackServiceClient } from "./generated/hackathon/track_service"
import type { ConfigServiceClient } from "./generated/hackathon/config_service"
import type { PrizeServiceClient } from "./generated/hackathon/prize_service"
import type { VoteServiceClient } from "./generated/vote/vote_service"
import type { SitePageServiceClient } from "./generated/site/site_page_service"
import type { StorageServiceClient } from "./generated/storage/storage_service"

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

// Unauthenticated prize client: a PUBLIC event's prize list is what it
// advertises and its awards are the result it announces, so PrizeService.Get
// checks visibility before it checks membership. The landing page's
// award-winning-projects section is built from this — it used to be three
// invented projects credited to invented teams.
export const publicPrizeClient = createClientFactory().create(
  PrizeServiceDefinition,
  channel,
)

// Unauthenticated page client: a PUBLIC event's own pages — the call for
// projects, the code of conduct, the winners announcement, the wrap-up post —
// are public content, and PageService.List says so explicitly (it falls back to
// visibility when the permission check fails). This is what puts them on the
// public event page, where the announcements are actually read.
export const publicPageClient = createClientFactory().create(
  PageServiceDefinition,
  channel,
)

// Unauthenticated site-page client: published platform pages are readable by
// everyone, and the footer links to them from pages a visitor sees before they
// have an account.
export const publicSitePageClient = createClientFactory().create(
  SitePageServiceDefinition,
  channel,
)

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
  // Everything an organiser configures about one event that is not the event
  // itself: windows, registration and submission forms, email templates,
  // branding, voting policy.
  config: ConfigServiceClient
  // Prizes are recorded after the vote; the tally is advisory and an organiser
  // has the final say, so this is a write path of its own.
  prize: PrizeServiceClient
  // Ballots and results.
  vote: VoteServiceClient
  // The PLATFORM's own pages — about, privacy, terms — as opposed to
  // PageService, which serves the pages belonging to one event. Different
  // scope, different authority: these are global and admin-only to write.
  sitePage: SitePageServiceClient
  // Permission to move a file, never the file itself. It hands back a URL the
  // BROWSER uploads to directly, so uploads never occupy an app-server
  // request — which is also why there is no `+server.ts` here that accepts
  // bytes.
  storage: StorageServiceClient
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
    track: factory.create(TrackServiceDefinition, channel),
    config: factory.create(ConfigServiceDefinition, channel),
    prize: factory.create(PrizeServiceDefinition, channel),
    vote: factory.create(VoteServiceDefinition, channel),
    sitePage: factory.create(SitePageServiceDefinition, channel),
    storage: factory.create(StorageServiceDefinition, channel),
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
