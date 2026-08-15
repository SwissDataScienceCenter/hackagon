/**
 * `applyPhaseCapabilities` — the action behind the hub's "Enable it" button.
 *
 * The bug this file exists for: the hub decided WHICH phase is live with
 * `currentAndNextPhase`, which falls back to the calendar when no phase has been
 * declared, and then offered a button whose action looked the phase up by
 * `current_phase_id` alone. Declaring a phase is an explicit act nobody is
 * required to perform, so in the ordinary state of a running hackathon the
 * warning rendered and its one action answered 400, every time.
 *
 * The tests are written against the RESOLUTION, not against the lookup: what
 * matters is that the button switches on what the live phase names, whichever
 * way "live" was decided. A test that asserted "the action calls
 * `currentAndNextPhase`" would pass against an implementation that resolved the
 * phase correctly and then wrote the wrong capabilities.
 */

import { describe, expect, it, vi } from "vitest"
import type { RequestEvent } from "@sveltejs/kit"
import { applyPhaseCapabilities } from "./stateActions"

const REGISTER = 1
const PROPOSE = 2
const TEAM_PREFS = 3
const VOTE = 5

const OPEN = 2
const CLOSED = 3

const HOUR = 3_600_000
const now = Date.now()

/** A phase whose dates are running right now. */
const live = {
  id: "phase-live",
  name: "Sprint Evening",
  startsAt: new Date(now - HOUR),
  endsAt: new Date(now + HOUR),
}
/** One that finished yesterday, so the calendar cannot pick it. */
const past = {
  id: "phase-past",
  name: "Warm-up",
  startsAt: new Date(now - 48 * HOUR),
  endsAt: new Date(now - 24 * HOUR),
}

interface Row {
  capability: number
  state: number
  openInPhaseId?: string
}

/**
 * A hackathon the action can read, plus the spy that records what it wrote.
 *
 * `get` is answered from the world rather than from a fixed literal, because the
 * action re-reads state on purpose (a stale page must not be able to switch
 * something back on) — so the read has to be the same object the write is judged
 * against.
 */
function world(opts: { currentPhaseId?: string; capabilities: Row[] }) {
  const setCapabilities = vi.fn(async () => ({}))
  const grpc = {
    hackathon: {
      get: async () => ({
        hackathon: {
          currentPhaseId: opts.currentPhaseId ?? "",
          phases: [past, live],
          capabilities: opts.capabilities,
        },
      }),
      setCapabilities,
    },
  }

  return {
    setCapabilities,
    event: {
      locals: { grpc },
      request: new Request("http://localhost/", { method: "POST" }),
    } as unknown as RequestEvent,
  }
}

/** The `{capability, enabled}` list the action posted, as a plain map. */
function written(spy: ReturnType<typeof vi.fn>): Record<number, boolean> {
  expect(spy, "the action wrote nothing at all").toHaveBeenCalledTimes(1)
  const req = spy.mock.calls[0]?.[0] as
    | { capabilities: { capability: number; enabled: boolean }[] }
    | undefined
  expect(req, "the write carried no payload to read back").toBeDefined()

  return Object.fromEntries(
    (req?.capabilities ?? []).map((c) => [c.capability, c.enabled]),
  )
}

/**
 * The live phase names team preferences, which are off; registration is off and
 * named by no phase; voting is on and named by no phase. That is the shape the
 * hub's warning appears in, and the shape every claim below is about.
 */
const gap: Row[] = [
  { capability: REGISTER, state: CLOSED },
  { capability: PROPOSE, state: CLOSED },
  { capability: TEAM_PREFS, state: CLOSED, openInPhaseId: live.id },
  { capability: VOTE, state: OPEN },
]

describe("applyPhaseCapabilities", () => {
  it("applies the live phase's plan when no phase has been declared", async () => {
    // The regression. `currentPhaseId` is empty — the calendar is what says
    // `phase-live` is running — and this used to be an unconditional 400.
    const { event, setCapabilities } = world({ capabilities: gap })

    const result = await applyPhaseCapabilities(event, "h1")

    expect(
      (result as { status?: number }).status,
      "a by-dates phase is still a current phase, and this must not refuse it",
    ).toBeUndefined()
    expect(written(setCapabilities)[TEAM_PREFS]).toBe(true)
  })

  it("applies the declared phase's plan, ignoring what the dates say", async () => {
    // A declaration outranks the calendar everywhere else in the product
    // (`resolvePhaseStatus`), so the fallback must not have become the rule:
    // `phase-past` is declared and names nothing, `phase-live` is running by its
    // dates and names team preferences. Nothing may come on.
    const { event, setCapabilities } = world({
      currentPhaseId: past.id,
      capabilities: gap,
    })

    await applyPhaseCapabilities(event, "h1")

    expect(
      written(setCapabilities)[TEAM_PREFS],
      "the declared phase names nothing, so nothing the calendar's phase names " +
        "may be switched on",
    ).toBe(false)
  })

  it("only ever switches things on", async () => {
    // The additive rule, asserted on the two capabilities no phase names:
    // registration must stay closed and voting must stay open. Applying a
    // phase's plan is a catch-up, never a reset.
    const { event, setCapabilities } = world({ capabilities: gap })

    await applyPhaseCapabilities(event, "h1")
    const sent = written(setCapabilities)

    expect(sent[VOTE], "voting was on and no phase names it").toBe(true)
    expect(sent[REGISTER], "registration was off and no phase names it").toBe(
      false,
    )
  })

  it("refuses when neither a declaration nor the calendar names a phase", async () => {
    // The one state that genuinely has no plan to read. It keeps a 400 — but it
    // is now reachable only when BOTH meanings of "current" come back empty,
    // which is what the message says.
    const setCapabilities = vi.fn(async () => ({}))
    const event = {
      locals: {
        grpc: {
          hackathon: {
            get: async () => ({
              hackathon: {
                currentPhaseId: "",
                phases: [past],
                capabilities: gap,
              },
            }),
            setCapabilities,
          },
        },
      },
      request: new Request("http://localhost/", { method: "POST" }),
    } as unknown as RequestEvent

    const result = (await applyPhaseCapabilities(event, "h1")) as {
      status: number
      data: { message: string }
    }

    expect(result.status).toBe(400)
    expect(result.data.message).toMatch(/no phase's dates cover today/i)
    expect(
      setCapabilities,
      "refusing must not have written anything on the way",
    ).not.toHaveBeenCalled()
  })

  it("refuses a declaration that names a phase this hackathon does not have", async () => {
    // `currentAndNextPhase` deliberately does NOT fall back to the dates for a
    // dangling pointer — the organiser has decided, and quietly applying some
    // other phase's plan would be worse than applying none. Pinned here because
    // the fallback added above is exactly the change that could erode it.
    const { event, setCapabilities } = world({
      currentPhaseId: "deleted-phase",
      capabilities: gap,
    })

    const result = (await applyPhaseCapabilities(event, "h1")) as {
      status: number
    }

    expect(result.status).toBe(400)
    expect(setCapabilities).not.toHaveBeenCalled()
  })
})
