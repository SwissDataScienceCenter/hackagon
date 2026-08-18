/**
 * The property behind issue #182: a participant must never be shown the
 * organiser's controls.
 *
 * Every gate in this module answers one question — "may this viewer be OFFERED
 * an organiser action?" — and the answer has to be no whenever the viewer's
 * membership is not known to be an owner. The `mayManageVoting` case is why
 * this file exists: the voting route used to decide that a viewer with NO
 * membership row was an admin looking in, reasoning that
 * `HackathonService.Get` admits nobody else without one. That is true of the
 * backend's view and not of the frontend's, because `myMembership` is matched
 * against `locals.platformUser`, which `hooks.server.ts` deliberately leaves
 * unset when `WhoAmI` answers `UNAVAILABLE` — so an absent row means "I could
 * not ask", not "an admin".
 *
 * The sweep below is the part worth keeping. It asserts the property over
 * EVERY exported gate rather than over the one that was wrong, so a helper
 * added later cannot reintroduce the same default without turning this red.
 * `mayPreferProjects` is excluded by name and with its reason: it is the one
 * gate here that is not an organiser gate at all.
 */
import { describe, expect, it } from "vitest"
import type { HackathonMember } from "$lib/server/grpc/generated/hackathon/entities/hackathon_member"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import * as capabilities from "./capabilities"
import {
  mayManagePages,
  mayManageParticipants,
  mayManagePhases,
  mayManageTracks,
  mayManageVoting,
  mayPreferProjects,
} from "./capabilities"

/** Only the two fields every gate here reads. */
function member(role: HackathonRole, isWaiting = false): HackathonMember {
  return { role, isWaiting } as HackathonMember
}

const OWNER = member(HackathonRole.HACKATHON_ROLE_OWNER)
const MEMBER = member(HackathonRole.HACKATHON_ROLE_MEMBER)

/**
 * Every organiser gate this module exports, discovered from the module rather
 * than listed by hand: a new helper joins the sweep by existing.
 */
const organiserGates = Object.entries(capabilities).filter(
  ([name, fn]) => typeof fn === "function" && name !== "mayPreferProjects",
) as [string, (m: HackathonMember | undefined, isAdmin?: boolean) => boolean][]

describe("organiser gates", () => {
  it("covers every exported gate but the one that is not one", () => {
    // A positive control on the sweep itself: an empty or accidentally
    // filtered list would make all four assertions below vacuous.
    expect(organiserGates.length).toBeGreaterThanOrEqual(5)
    expect(organiserGates.map(([name]) => name)).toContain("mayManageVoting")
    expect(organiserGates.map(([name]) => name)).not.toContain(
      "mayPreferProjects",
    )
  })

  it.each(organiserGates)("%s refuses an unknown membership", (_name, gate) => {
    expect(gate(undefined, false)).toBe(false)
  })

  it.each(organiserGates)("%s refuses a plain member", (_name, gate) => {
    expect(gate(MEMBER, false)).toBe(false)
  })

  it.each(organiserGates)("%s admits the owner", (_name, gate) => {
    expect(gate(OWNER, false)).toBe(true)
  })

  it.each(organiserGates)(
    "%s admits a global admin who never joined",
    (_name, gate) => {
      // The escape hatch casbin gives an admin, and the reason "no membership
      // row" was ever read as "organiser". It is stated now, not inferred.
      expect(gate(undefined, true)).toBe(true)
    },
  )
})

describe("mayManageVoting", () => {
  it("does not read an absent membership as an admin", () => {
    expect(mayManageVoting(undefined, false)).toBe(false)
  })

  it("agrees with the other hackathon:write gates", () => {
    // All of these mirror the same casbin rule (`hackathon:write`, granted to
    // Owner and to an admin through the global escape hatch), so a viewer who
    // is offered one must be offered all of them — otherwise the sidebar and
    // the page it leads to can disagree about who the organiser is.
    for (const m of [undefined, MEMBER, OWNER]) {
      expect(mayManageVoting(m)).toBe(mayManageParticipants(m))
      expect(mayManageVoting(m)).toBe(mayManagePhases(m))
      expect(mayManageVoting(m)).toBe(mayManagePages(m))
      expect(mayManageVoting(m)).toBe(mayManageTracks(m))
    }
  })
})

describe("mayPreferProjects", () => {
  it("is offered to a plain member, unlike the organiser gates", () => {
    // The control that proves the sweep above is testing a real distinction
    // rather than a list that happens to hold.
    expect(mayPreferProjects(MEMBER)).toBe(true)
  })

  it("is withheld from a waitlisted member and from a non-participant", () => {
    expect(
      mayPreferProjects(member(HackathonRole.HACKATHON_ROLE_MEMBER, true)),
    ).toBe(false)
    expect(mayPreferProjects(undefined)).toBe(false)
  })
})
