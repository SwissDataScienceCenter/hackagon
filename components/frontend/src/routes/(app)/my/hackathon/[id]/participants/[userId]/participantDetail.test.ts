import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/svelte"
import { ClientError, Status } from "nice-grpc-common"

import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"
import { load } from "./+page.server"
import ParticipantDetailPage from "./+page.svelte"
import type { PageData } from "./$types"

/** What this load actually returns; `PageServerLoad` also permits `void`. */
type LoadedData = Exclude<Awaited<ReturnType<typeof load>>, void>

/*
 * Viewing one participant.
 *
 * The bug these pin: the registration read is the SECOND thing on the page, and
 * a failure of it used to `error()` the whole route — so an organiser opening
 * someone's record got an error page instead of the name, email, affiliation and
 * standing that the layout had already resolved and already authorised.
 *
 * The 404 branch was the worst of them, because it reported a fact about the
 * CALLER ("user <sub> not found", the only NotFound `GetRegistrationResponse`
 * can return — a missing form response is a normal `submitted: false`) as a
 * claim about the person being viewed, which the roster lookup two lines above
 * had just disproved.
 */

const OWNER = { role: HackathonRole.HACKATHON_ROLE_OWNER, isWaiting: false }

const alice = {
  id: "u1",
  username: "alice",
  displayName: "Alice Anderson",
  email: "alice@example.org",
  affiliation: "SDSC",
  skills: "Go, Svelte",
  dietary: "Vegetarian",
  avatarUrl: "",
}

type FormSchema = {
  fields: { key: string; label: string }[]
  consents: { key: string; label: string }[]
}

type Roster = {
  id: string
  registrationForm?: FormSchema
  members: {
    user: typeof alice
    role: HackathonRole
    isWaiting: boolean
    joinedAt?: Date
  }[]
}

/** A hackathon that asks nothing at registration — the reported case. */
function hackathonWithNoForm(): Roster {
  return {
    id: "h1",
    members: [
      { user: alice, ...OWNER, joinedAt: new Date("2026-03-01T09:00:00Z") },
      { user: { ...alice, id: "u2", username: "bob" }, ...OWNER },
    ],
  }
}

type Registration = Record<string, unknown>

/**
 * Build the `event` a page load receives. Deliberately hand-rolled rather than
 * mocked: `requireGrpc` hands back whatever it is given, so a plain object is
 * the real code path.
 */
function makeEvent(options: {
  hackathon?: Roster
  userId?: string
  isGlobalAdmin?: boolean
  myMembership?: { role: HackathonRole; isWaiting: boolean } | null
  registration?: Registration | (() => never)
}) {
  const warn = vi.fn()
  const hackathon = options.hackathon ?? hackathonWithNoForm()
  const getRegistrationResponse = vi.fn(async () => {
    const r = options.registration ?? { submitted: false }
    if (typeof r === "function") r()
    return r
  })

  return {
    warn,
    getRegistrationResponse,
    event: {
      params: { id: hackathon.id, userId: options.userId ?? "u1" },
      locals: {
        logger: { warn },
        grpc: { hackathon: { getRegistrationResponse } },
      },
      parent: async () => ({
        hackathon,
        myMembership:
          options.myMembership === undefined ? OWNER : options.myMembership,
        isGlobalAdmin: options.isGlobalAdmin ?? false,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a load event is far wider than this load reads
    } as any,
  }
}

const run = (options: Parameters<typeof makeEvent>[0] = {}) => {
  const h = makeEvent(options)
  return { ...h, result: load(h.event) as Promise<LoadedData> }
}

/**
 * The page's own prop type is the WHOLE of `PageData`, layout data included;
 * this page reads four keys of it, and the load under test returns exactly
 * those.
 */
const asPageData = (data: LoadedData) => data as unknown as PageData

/** Throw the way nice-grpc does, so the `instanceof ClientError` path is real. */
const rejectWith = (code: Status) => () => {
  throw new ClientError(
    "/hackathon.HackathonService/GetRegistrationResponse",
    code,
    "nope",
  )
}

describe("the participant detail load", () => {
  it("shows the person when the hackathon asks no registration questions", async () => {
    const { result } = run()
    const data = await result

    expect(data.person).toMatchObject({
      name: "Alice Anderson",
      username: "alice",
      email: "alice@example.org",
      affiliation: "SDSC",
      skills: "Go, Svelte",
      dietary: "Vegetarian",
    })
    // Not "unavailable": the RPC answered, and what it answered is that there
    // is nothing on file. The page says the event asks nothing.
    expect(data.registration.unavailable).toBe(false)
    expect(data.registration.hasForm).toBe(false)
    expect(data.registration.submitted).toBe(false)
  })

  // The reported bug, in one assertion: the basic information survives.
  it("still shows the person when the registration read 404s", async () => {
    const { result, warn } = run({ registration: rejectWith(Status.NOT_FOUND) })
    const data = await result

    expect(data.person.name).toBe("Alice Anderson")
    expect(data.person.email).toBe("alice@example.org")
    expect(data.membership.role).toBe(HackathonRole.HACKATHON_ROLE_OWNER)
    // Named as a failed lookup, never as "this event asks nothing" — that
    // would be the page stating something it never managed to read.
    expect(data.registration.unavailable).toBe(true)
    expect(warn).toHaveBeenCalledOnce()
  })

  it("still shows the person when the registration read fails any other way", async () => {
    for (const code of [
      Status.INTERNAL,
      Status.UNAVAILABLE,
      Status.INVALID_ARGUMENT,
    ]) {
      const data = await run({ registration: rejectWith(code) }).result
      expect(data.person.name, `code ${code}`).toBe("Alice Anderson")
      expect(data.registration.unavailable, `code ${code}`).toBe(true)
    }
  })

  it("survives a registration read that fails with no gRPC status at all", async () => {
    const data = await run({
      registration: () => {
        throw new Error("socket hang up")
      },
    }).result

    expect(data.person.name).toBe("Alice Anderson")
    expect(data.registration.unavailable).toBe(true)
  })

  // The one refusal that still ends the page. This page is offered on
  // "may manage participants" and the RPC enforces the same hackathon write,
  // so a refusal means the reader should not be on the record at all.
  it("still refuses the whole page when the answers are denied", async () => {
    await expect(
      run({ registration: rejectWith(Status.PERMISSION_DENIED) }).result,
    ).rejects.toMatchObject({ status: 403 })
  })

  it("refuses a reader who does not manage participants, before asking", async () => {
    const { result, getRegistrationResponse } = run({
      myMembership: { role: HackathonRole.HACKATHON_ROLE_MEMBER, isWaiting: false },
    })

    await expect(result).rejects.toMatchObject({ status: 403 })
    expect(getRegistrationResponse).not.toHaveBeenCalled()
  })

  it("404s someone who is genuinely not on this hackathon's roster", async () => {
    // The 404 that IS about the person, and the only one left: it is decided
    // by the roster, not by what a second RPC happened to answer.
    const { result, getRegistrationResponse } = run({ userId: "nobody" })

    await expect(result).rejects.toMatchObject({ status: 404 })
    expect(getRegistrationResponse).not.toHaveBeenCalled()
  })

  it("labels the answers against the event's form when there is one", async () => {
    const hackathon = {
      ...hackathonWithNoForm(),
      registrationForm: {
        fields: [
          { key: "why", label: "Why are you joining?" },
          { key: "diet", label: "Dietary needs" },
        ],
        consents: [{ key: "photo", label: "Happy to be photographed" }],
      },
    }

    const data = await run({
      hackathon,
      registration: {
        submitted: true,
        // Out of schema order on purpose: the wire's key order is not the
        // order the questions were asked in.
        responses: { diet: "None", why: "To learn" },
        consents: { photo: false },
      },
    }).result

    expect(data.registration.unavailable).toBe(false)
    expect(data.registration.hasForm).toBe(true)
    expect(data.registration.answers).toEqual([
      { label: "Why are you joining?", value: "To learn" },
      { label: "Dietary needs", value: "None" },
    ])
    // A withheld consent is a visible row, not an absent one.
    expect(data.registration.consents).toEqual([
      { label: "Happy to be photographed", given: false },
    ])
  })
})

/*
 * Rendered from exactly what the load returned, rather than from a hand-written
 * prop bag: the bug was that the page never got the chance to render at all, so
 * a fixture invented here could agree with a load that still threw.
 */
describe("the participant detail page", () => {
  afterEach(cleanup)

  /** Every fact the reporter asked to keep seeing. */
  const expectTheBasics = () => {
    expect(screen.getByRole("heading", { name: "Alice Anderson" })).toBeTruthy()
    for (const fact of [
      "alice",
      "alice@example.org",
      "SDSC",
      "Go, Svelte",
      "Vegetarian",
    ]) {
      expect(screen.getByText(fact), `${fact} must be on screen`).toBeTruthy()
    }
  }

  it("shows the basics, and says so, when the event asks no questions", async () => {
    render(ParticipantDetailPage, { data: asPageData(await run().result) })

    expectTheBasics()
    expect(
      screen.getByText(/asks no registration questions/i),
    ).toBeTruthy()
  })

  // The reported bug, at the pixel: an error page used to be here instead.
  it("shows the basics when the registration read failed", async () => {
    const data = await run({ registration: rejectWith(Status.NOT_FOUND) })
      .result
    render(ParticipantDetailPage, { data: asPageData(data) })

    expectTheBasics()
    expect(screen.getByText(/could not be loaded/i)).toBeTruthy()
    // And does not quietly claim the event asks nothing — that is a different
    // fact, and this render never established it.
    expect(screen.queryByText(/asks no registration questions/i)).toBeNull()
  })
})
