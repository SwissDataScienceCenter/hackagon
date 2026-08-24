import { describe, it, expect } from "vitest"
import type { Hackathon } from "$lib/server/grpc/generated/hackathon/entities/hackathon"
import type { HackathonMember } from "$lib/server/grpc/generated/hackathon/entities/hackathon_member"
import type { Project } from "$lib/server/grpc/generated/hackathon/entities/project"
import type { User } from "$lib/server/grpc/generated/user/entities/user"
import { projectEditData } from "./projectEdit"

// Numeric enum values, spelled out so a fixture reads as the case it stands for.
// HackathonRole: OWNER=1, MEMBER=2. ProjectStatus: PROPOSED=1, APPROVED=2.
const OWNER = 1
const MEMBER = 2
const PROPOSED = 1
const APPROVED = 2
const GLOBAL_ADMIN = 1

const ALICE = "user-alice"
const BOB = "user-bob"

const user = (id: string, roles: number[] = []) => ({ id, roles }) as User

const member = (role: number) => ({ role, isWaiting: false }) as HackathonMember

// SvelteKit's `error()` throws an `HttpError`, whose text lives in `body.message`
// rather than in `Error.message` — so a plain `toThrow(/…/)` would match nothing
// and pass for the wrong reason. Captured and asserted on directly instead.
const refusal = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return e as { status: number; body: { message: string } }
  }
  throw new Error("expected a refusal, got none")
}

const hackathon = (project: Partial<Project>) =>
  ({
    id: "hack-1",
    tracks: [],
    projects: [
      { id: "p1", creatorId: ALICE, status: PROPOSED, ...project } as Project,
    ],
  }) as unknown as Hackathon

describe("projectEditData", () => {
  it("lets the proposer edit their proposal while it awaits review", () => {
    const data = projectEditData(
      hackathon({ status: PROPOSED }),
      "p1",
      member(MEMBER),
      user(ALICE),
    )

    expect(data.project.id).toBe("p1")
  })

  // The rule the review asked for: editing belongs to an open proposal, and an
  // approved project belongs to the hackathon rather than to whoever proposed it.
  it("refuses the proposer once the project is approved", () => {
    const e = refusal(() =>
      projectEditData(
        hackathon({ status: APPROVED }),
        "p1",
        member(MEMBER),
        user(ALICE),
      ),
    )

    expect(e.status).toBe(403)
    // Names the status rather than their standing — they did propose it.
    expect(e.body.message).toMatch(/reviewed/)
  })

  it("refuses a member who did not propose it", () => {
    const e = refusal(() =>
      projectEditData(
        hackathon({ status: PROPOSED }),
        "p1",
        member(MEMBER),
        user(BOB),
      ),
    )

    expect(e.status).toBe(403)
    expect(e.body.message).toMatch(/permission/)
  })

  // An owner and an admin are not gated on status: `project:write` across the
  // hackathon is what they hold, and correcting an approved project is theirs.
  it("lets a hackathon owner edit at any status", () => {
    for (const status of [PROPOSED, APPROVED]) {
      const data = projectEditData(
        hackathon({ status }),
        "p1",
        member(OWNER),
        user(BOB),
      )

      expect(data.project.status).toBe(status)
    }
  })

  it("lets a global admin edit an approved project they did not propose", () => {
    const data = projectEditData(
      hackathon({ status: APPROVED }),
      "p1",
      null,
      user(BOB, [GLOBAL_ADMIN]),
    )

    expect(data.project.id).toBe("p1")
  })

  it("404s a project that is not in this hackathon", () => {
    const e = refusal(() =>
      projectEditData(hackathon({}), "nope", member(OWNER), user(ALICE)),
    )

    expect(e.status).toBe(404)
  })
})
