import { describe, it, expect } from "vitest"
import { currentPhase } from "./phase"

const NOW = new Date("2026-07-15T12:00:00Z")

function phase(name: string, startsAt?: string, endsAt?: string) {
  return {
    name,
    startsAt: startsAt ? new Date(startsAt) : undefined,
    endsAt: endsAt ? new Date(endsAt) : undefined,
  }
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
