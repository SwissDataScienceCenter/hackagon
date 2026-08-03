import { describe, it, expect } from "vitest"
import { activePhase, currentPhase } from "./phase"

const NOW = new Date("2026-07-15T12:00:00Z")

function phase(name: string, startsAt?: string, endsAt?: string) {
  return {
    name,
    startsAt: startsAt ? new Date(startsAt) : undefined,
    endsAt: endsAt ? new Date(endsAt) : undefined,
  }
}

function identified(name: string, startsAt?: string, endsAt?: string) {
  return { id: name.toLowerCase(), ...phase(name, startsAt, endsAt) }
}

describe("currentPhase", () => {
  it("picks the phase whose window contains now", () => {
    const hacking = phase("Hacking", "2026-07-10", "2026-07-20")
    const result = currentPhase(
      [phase("Kickoff", "2026-07-01", "2026-07-09"), hacking],
      NOW,
    )

    expect(result).toEqual({ phase: hacking, active: true })
  })

  it("prefers the latest-started phase when windows overlap", () => {
    const mentoring = phase("Mentoring", "2026-07-14", "2026-07-18")
    const result = currentPhase(
      [phase("Hacking", "2026-07-10", "2026-07-20"), mentoring],
      NOW,
    )

    expect(result).toEqual({ phase: mentoring, active: true })
  })

  it("falls back to the soonest upcoming phase in a gap", () => {
    const judging = phase("Judging", "2026-07-20", "2026-07-22")
    const result = currentPhase(
      [
        phase("Kickoff", "2026-07-01", "2026-07-05"),
        phase("Awards", "2026-07-25", "2026-07-26"),
        judging,
      ],
      NOW,
    )

    expect(result).toEqual({ phase: judging, active: false })
  })

  it("falls back to the first phase before the hackathon starts", () => {
    const kickoff = phase("Kickoff", "2026-08-01", "2026-08-02")
    const result = currentPhase([kickoff], NOW)

    expect(result).toEqual({ phase: kickoff, active: false })
  })

  it("returns undefined once every phase has ended", () => {
    const result = currentPhase(
      [
        phase("Kickoff", "2026-07-01", "2026-07-05"),
        phase("Judging", "2026-07-06", "2026-07-10"),
      ],
      NOW,
    )

    expect(result).toBeUndefined()
  })

  it("treats a started phase with no end date as still running", () => {
    const openEnded = phase("Hacking", "2026-07-10")
    const result = currentPhase([openEnded], NOW)

    expect(result).toEqual({ phase: openEnded, active: true })
  })

  it("skips undated phases entirely", () => {
    const dated = phase("Judging", "2026-07-20", "2026-07-22")
    const result = currentPhase([phase("Someday"), dated], NOW)

    expect(result).toEqual({ phase: dated, active: false })
  })

  it("returns undefined when no phase has dates", () => {
    expect(currentPhase([phase("A"), phase("B")], NOW)).toBeUndefined()
  })

  it("returns undefined for an empty list", () => {
    expect(currentPhase([], NOW)).toBeUndefined()
  })
})

describe("activePhase", () => {
  const kickoff = identified("Kickoff", "2026-07-01", "2026-07-05")
  const hacking = identified("Hacking", "2026-07-10", "2026-07-20")
  const judging = identified("Judging", "2026-07-25", "2026-07-26")
  const all = [kickoff, hacking, judging]

  it("derives from the dates when nothing is declared", () => {
    expect(activePhase(all, undefined, NOW)).toEqual({
      phase: hacking,
      active: true,
    })
  })

  it("prefers the declared phase over what the dates say", () => {
    // The organizer advanced to Judging even though its window has not opened.
    // Deriving from dates here would contradict them in front of members.
    expect(activePhase(all, "judging", NOW)).toEqual({
      phase: judging,
      active: true,
    })
  })

  it("treats a declared past phase as active", () => {
    // Running behind schedule is the other half of the same case.
    expect(activePhase(all, "kickoff", NOW)).toEqual({
      phase: kickoff,
      active: true,
    })
  })

  it("falls back to the dates when the declared phase is gone", () => {
    // The phase was deleted; the stored id outlives it until the next write.
    expect(activePhase(all, "deleted-phase", NOW)).toEqual({
      phase: hacking,
      active: true,
    })
  })

  it("returns undefined when nothing is declared and nothing has dates", () => {
    expect(activePhase([identified("Someday")], undefined, NOW)).toBeUndefined()
  })

  it("returns a declared phase even when it has no dates", () => {
    const undated = identified("Someday")

    expect(activePhase([undated], "someday", NOW)).toEqual({
      phase: undated,
      active: true,
    })
  })
})
