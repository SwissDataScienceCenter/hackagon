import { describe, it, expect } from "vitest"
import type { Hackathon } from "$lib/server/grpc/generated/hackathon/entities/hackathon"
import type { HackathonMember } from "$lib/server/grpc/generated/hackathon/entities/hackathon_member"
import type { Project } from "$lib/server/grpc/generated/hackathon/entities/project"
import type { User } from "$lib/server/grpc/generated/user/entities/user"
import { myProjects } from "./myProjects"

// HackathonRole: OWNER=1, MEMBER=2. ProjectStatus: PROPOSED=1, APPROVED=2,
// REJECTED=3.
const OWNER = 1
const MEMBER = 2
const PROPOSED = 1
const APPROVED = 2
const REJECTED = 3

const ALICE = "user-alice"
const BOB = "user-bob"

const member = (id: string, role: number, isWaiting = false) =>
  ({ user: { id } as User, role, isWaiting }) as HackathonMember

const project = (
  id: string,
  creatorId: string,
  status: number,
  createdAt: string,
) => ({ id, creatorId, status, createdAt: new Date(createdAt) }) as Project

const hackathon = (members: HackathonMember[], projects: Project[]) =>
  ({ members, projects }) as unknown as Hackathon

const ids = (projects: Project[]) => projects.map((p) => p.id)

describe("myProjects", () => {
  const projects = [
    project("p-old", ALICE, APPROVED, "2026-10-01T09:00:00Z"),
    project("p-bob", BOB, PROPOSED, "2026-10-02T09:00:00Z"),
    project("p-new", ALICE, PROPOSED, "2026-10-03T09:00:00Z"),
    project("p-rej", ALICE, REJECTED, "2026-10-02T12:00:00Z"),
  ]

  it("lists a participant's own projects at every status, newest first", () => {
    const h = hackathon([member(ALICE, MEMBER), member(BOB, MEMBER)], projects)

    expect(ids(myProjects(h, ALICE))).toEqual(["p-new", "p-rej", "p-old"])
  })

  it("lists them for an owner who also joined as a participant", () => {
    const h = hackathon([member(ALICE, OWNER)], projects)

    expect(ids(myProjects(h, ALICE))).toEqual(["p-new", "p-rej", "p-old"])
  })

  // An owner who never joined has no participant row, whatever they proposed.
  it("lists nothing for an owner who is not a participant", () => {
    const h = hackathon([member(BOB, MEMBER)], projects)

    expect(myProjects(h, ALICE)).toEqual([])
  })

  it("lists nothing for a waitlisted participant", () => {
    const h = hackathon([member(ALICE, MEMBER, true)], projects)

    expect(myProjects(h, ALICE)).toEqual([])
  })

  it("lists nothing for a viewer with no platform user", () => {
    const h = hackathon([member(ALICE, MEMBER)], projects)

    expect(myProjects(h, undefined)).toEqual([])
  })
})
