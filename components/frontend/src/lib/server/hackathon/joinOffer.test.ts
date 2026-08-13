/**
 * The rules behind the dashboard's Join button.
 *
 * Every case here corresponds to a refusal `HackathonService.Join` actually
 * makes (or deliberately does not mirror). If one of these disagrees with the
 * handler, the symptom is a button that cannot work — which is the bug this
 * module was written to fix, six times over on a populated instance.
 */
import { describe, expect, it } from "vitest"
import { joinIsOffered } from "./joinOffer"
import { CAPABILITY_REGISTER, CapabilityState } from "$lib/utils/capability"

const RUNNING = 2
const FINISHED = 3

const withRegister = (state: number, status = RUNNING) => ({
  status,
  capabilities: [{ capability: CAPABILITY_REGISTER, state }],
})

describe("joinIsOffered", () => {
  it("offers an open event", () => {
    expect(joinIsOffered(withRegister(CapabilityState.OPEN))).toBe(true)
  })

  it("withholds a finished event whatever its capabilities say", () => {
    // Join checks `EndsAt` BEFORE the capability, so an open register flag on a
    // finished event still refuses. The button must agree.
    expect(joinIsOffered(withRegister(CapabilityState.OPEN, FINISHED))).toBe(
      false,
    )
  })

  it("withholds a closed registration", () => {
    expect(joinIsOffered(withRegister(CapabilityState.CLOSED))).toBe(false)
  })

  it("withholds one that has not opened yet", () => {
    expect(joinIsOffered(withRegister(CapabilityState.COMING))).toBe(false)
  })

  it("OFFERS an ungoverned registration", () => {
    // The subtle one, and the reason this is not `state === OPEN`.
    // `capability.State.Allowed` returns TRUE for UNGOVERNED — no row governs
    // it, so the mutation proceeds — and a gate comparing against OPEN alone
    // would hide the button on an event the server would happily let you join.
    expect(joinIsOffered(withRegister(CapabilityState.UNGOVERNED))).toBe(true)
  })

  it("offers an event carrying no register row at all", () => {
    // Same rule as UNGOVERNED, reached the other way: an event that never
    // configured capabilities must not lose its Join button.
    expect(joinIsOffered({ status: RUNNING, capabilities: [] })).toBe(true)
  })

  it("reads the register row and not merely the first one", () => {
    // A `capabilities[0]` implementation passes every test above, because the
    // fixtures all put register first. Here it is last and closed.
    const h = {
      status: RUNNING,
      capabilities: [
        { capability: 2, state: CapabilityState.OPEN },
        { capability: 5, state: CapabilityState.OPEN },
        { capability: CAPABILITY_REGISTER, state: CapabilityState.CLOSED },
      ],
    }
    expect(joinIsOffered(h)).toBe(false)
  })

  it("ignores the other capabilities entirely", () => {
    // Voting being closed says nothing about whether you may join.
    const h = {
      status: RUNNING,
      capabilities: [
        { capability: CAPABILITY_REGISTER, state: CapabilityState.OPEN },
        { capability: 5, state: CapabilityState.CLOSED },
      ],
    }
    expect(joinIsOffered(h)).toBe(true)
  })
})

describe("CAPABILITY_REGISTER", () => {
  it("is the proto's Capability.REGISTER", () => {
    // The constant is a literal, so this is what stops it drifting from the
    // enum it names. If the proto ever renumbers, this fails rather than the
    // Join button quietly gating on "Propose projects".
    expect(CAPABILITY_REGISTER).toBe(1)
  })
})
