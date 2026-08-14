import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Single source of truth for the test actors and what the seed fixture
// (`just db::seed`, see components/backend/cmd/seed/README.md) entitles each
// of them to. Keycloak credentials come from the checked-in dev realm
// (tools/configs/keycloak/realm-hackagon.json) — deterministic on every boot.
// The journey additionally uses a larger cast of "extras" (cast.json),
// provisioned into Keycloak by scripts/roster.sh.

export type PersonaKey = "admin" | "alice" | "bob" | "charles"

export interface Persona {
  key: PersonaKey
  username: string
  password: string
  displayName: string
  /** First letter of the display name — shown in the NavBar avatar button. */
  initial: string
  /** Role this persona plays across the lifecycle recipe. */
  role: string
}

export const PERSONAS: Record<PersonaKey, Persona> = {
  admin: {
    key: "admin",
    username: "hackagon-admin",
    password: "aliceandbob",
    displayName: "Hackagon Admin",
    initial: "H",
    role: "Global admin (casbin g2 'admin', bootstrapped from backend config — works even on an empty DB)",
  },
  alice: {
    key: "alice",
    username: "alice",
    password: "aliceandbob",
    displayName: "Alice Wonderland",
    initial: "A",
    role: "Organizer — creator/Owner of H1 in the seed; Member of H2 and H3",
  },
  bob: {
    key: "bob",
    username: "bob",
    password: "aliceandbob",
    displayName: "Bob Henderson",
    initial: "B",
    role: "Confirmed participant — Member of H1 and H2 in the seed",
  },
  charles: {
    key: "charles",
    username: "charles",
    password: "aliceandbob",
    displayName: "Charles Whitfield",
    initial: "C",
    role: "Waitlisted participant — waiting on H1, no casbin role anywhere",
  },
}

export const ALL_PERSONAS: Persona[] = Object.values(PERSONAS)

/**
 * The self-service walk-in: deliberately NOT in PERSONAS and never
 * provisioned by the realm import or roster.sh — she exists only by walking
 * through Keycloak's self-registration form (smoke 05, the new-user funnel).
 * Fixed name keeps the cast deterministic; the standard smoke reset wipes
 * her between runs, and registerViaKeycloak falls back to plain login when
 * a --no-reset rerun finds the account already registered.
 */
export interface SelfRegistrant {
  username: string
  password: string
  firstName: string
  lastName: string
  email: string
  /** First letter of the first name — shown in the NavBar avatar button. */
  initial: string
}

export const SELF_REGISTRANT: SelfRegistrant = {
  username: "wanda-walkin",
  password: "aliceandbob",
  firstName: "Wanda",
  lastName: "Walkin",
  email: "wanda-walkin@hackagon.dev",
  initial: "W",
}

export const KEYCLOAK = {
  baseUrl: process.env.E2E_KEYCLOAK_URL ?? "http://localhost:8180",
  realm: "hackagon",
  /** Confidential client with direct-access grants — same one `just rpc::as` uses. */
  clientId: "hackagon-backend",
  get tokenUrl(): string {
    return `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`
  },
}

export const GRPC_ADDR = process.env.E2E_GRPC_ADDR ?? "localhost:3000"

// ─── The extended journey cast ───────────────────────────────────────────────
// 11 extra participants from cast.json make the lifecycle look like a real
// event: a registration wave, a capacity cut-off, a waitlist, a dropout and a
// backfill. Extras act through the API (real Keycloak tokens, full RBAC);
// the four principals above also get browser sessions.

export interface Credentials {
  username: string
  password: string
}

export interface ExtraParticipant extends Credentials {
  firstName: string
  lastName: string
  email: string
  affiliation: string
}

interface CastFile {
  password: string
  extras: Omit<ExtraParticipant, "password">[]
}

const castFile = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "cast.json"),
    "utf8",
  ),
) as CastFile

export const EXTRAS: ExtraParticipant[] = castFile.extras.map((e) => ({
  ...e,
  password: castFile.password,
}))

export function credentials(p: {
  username: string
  password: string
}): Credentials {
  return { username: p.username, password: p.password }
}

/** The journey's capacity/waitlist screenplay (see act 2 and act 5). */
export const JOURNEY_CAST = {
  /** Announced max capacity of the journey hackathon. */
  capacity: 8,
  /** Everyone who registers in act 2 (13 sign-ups, all waitlisted).
   * The last extra (noor.haddad) is NOT here — she is the same-day walk-in
   * who registers on-site in act 6. */
  registrants: [
    credentials(PERSONAS.alice),
    credentials(PERSONAS.bob),
    credentials(PERSONAS.charles),
    ...EXTRAS.slice(0, 10).map(credentials),
  ],
  /** Same-day walk-in: registered on-site in act 6, admin-approved and
   * assigned into the no-show's team seat. */
  walkIn: credentials(EXTRAS[10]!),
  /** Approved in act 5's first wave — exactly `capacity` people. */
  approveWave: [
    credentials(PERSONAS.alice),
    credentials(PERSONAS.bob),
    ...EXTRAS.slice(0, 6).map(credentials),
  ],
  /** Drops out after approval (freeing a spot). */
  dropout: credentials(EXTRAS[2]!),
  /** First from the waitlist, moved up into the freed spot. */
  backfill: credentials(EXTRAS[6]!),
  /** Still waitlisted when registration closes. */
  finalWaitlist: [
    credentials(PERSONAS.charles),
    ...EXTRAS.slice(7, 10).map(credentials),
  ],
}

// ─── Seed fixture expectations (snapshot/smoke mode) ─────────────────────────
// Derived from cmd/seed/main.go + cmd/seed/README.md. If the seed changes,
// update this matrix — the smoke suite asserts it.
//
// What it does NOT say is that the fixture is the whole database. Instances get
// populated on purpose (skills/seed-past-hackathons puts six real SDSC editions
// beside these three), so a spec reading this matrix asserts that the fixture's
// rows are present and correct and that the fixture's forbidden rows are absent
// — never that a list contains nothing else, and never a total.

export type SeedHackathonKey = "h1" | "h2" | "h3"

export const SEED_HACKATHONS: Record<
  SeedHackathonKey,
  { name: string; visibility: "public" | "private"; statusBadge: string }
> = {
  h1: {
    name: "AI Innovation Challenge 2026",
    visibility: "public",
    statusBadge: "Upcoming",
  },
  h2: {
    name: "Climate Tech Hackathon 2026",
    visibility: "public",
    statusBadge: "Active",
  },
  h3: {
    name: "Internal Product Sprint",
    visibility: "private",
    statusBadge: "Finished",
  },
}

/**
 * What the fixture entitles a persona to SEE on the dashboard.
 *
 * Read these as a lower bound plus a prohibition, never as the whole page: a
 * populated instance (the six real SDSC editions from
 * skills/seed-past-hackathons, created by hackagon-admin) adds rows to both
 * sections, and that is a supported state. So the fields below say "these must
 * be there, with this badge" and "these must NOT be there" — nothing here may
 * be read as "and nothing else".
 *
 * There is deliberately no `connectedCount`. The dashboard states a number and
 * renders the list it counted; the spec asserts those two against EACH OTHER
 * (03-dashboard.spec.ts), which is both stronger — it catches a count that
 * disagrees with its own rows — and immune to a second seeder. The constant
 * that used to live here said 3 for hackagon-admin on an instance where the
 * page said 9, and failed every run for a day.
 */
export interface DashboardExpectation {
  /** Rows that must appear under "Your hackathons", with the badge text. */
  mine: {
    hackathon: SeedHackathonKey
    badge: "Owner" | "Member" | "Waitlisted"
  }[]
  /**
   * Fixture hackathons that must appear under "Other hackathons" — public, and
   * this persona is not in them. Fixture hackathons NOT listed here must be
   * absent from that section; extra events from other seeders may be present.
   */
  others: SeedHackathonKey[]
}

/**
 * Member-view access (/my/hackathon/<id>/overview) per persona. The backend is
 * authoritative: HackathonService.Get runs a casbin Read check on the
 * hackathon domain. Casbin roles granted by the seed:
 *   H1: alice=Owner, admin=Member, bob=Member  (charles: waitlisted, NO role)
 *   H2: admin=Owner, alice=Member, bob=Member
 *   H3: admin=Owner, alice=Member
 * hackagon-admin additionally passes everything via the g2 admin escape hatch.
 */
export type Access = "ok" | "forbidden"

export const SEED_EXPECTATIONS: Record<
  PersonaKey,
  {
    dashboard: DashboardExpectation
    memberView: Record<SeedHackathonKey, Access>
  }
> = {
  admin: {
    dashboard: {
      // Membership badge reflects the per-hackathon casbin role, not the
      // global admin role (GetHackathonRole ignores g2).
      mine: [
        { hackathon: "h1", badge: "Member" },
        { hackathon: "h2", badge: "Owner" },
        { hackathon: "h3", badge: "Owner" },
      ],
      others: [],
    },
    memberView: { h1: "ok", h2: "ok", h3: "ok" },
  },
  alice: {
    dashboard: {
      mine: [
        { hackathon: "h1", badge: "Owner" },
        { hackathon: "h2", badge: "Member" },
        { hackathon: "h3", badge: "Member" },
      ],
      others: [],
    },
    memberView: { h1: "ok", h2: "ok", h3: "ok" },
  },
  bob: {
    dashboard: {
      mine: [
        { hackathon: "h1", badge: "Member" },
        { hackathon: "h2", badge: "Member" },
      ],
      others: [],
    },
    memberView: { h1: "ok", h2: "ok", h3: "forbidden" },
  },
  charles: {
    dashboard: {
      mine: [{ hackathon: "h1", badge: "Waitlisted" }],
      others: ["h2"],
    },
    // Waitlisted => participant row exists but no casbin role => 403.
    memberView: { h1: "forbidden", h2: "forbidden", h3: "forbidden" },
  },
}
