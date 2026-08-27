import { describe, it, expect, vi } from "vitest"
import type { AuthorizedGrpc } from "$lib/server/grpc/client"
import { projectReviewFor } from "./projectReview"

// Numeric enum values, spelled out so a fixture reads as the case it stands for.
// ProjectStatus: PROPOSED=1, APPROVED=2, REJECTED=3.
const PROPOSED = 1
const APPROVED = 2
const REJECTED = 3

const REJECTED_AT = new Date("2026-08-20T10:00:00Z")

/** A grpc double exposing only `project.get`, which is all this reads. */
const grpcReturning = (get: ReturnType<typeof vi.fn>) =>
  ({ project: { get } }) as unknown as AuthorizedGrpc

const comment = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  userId: "user-alice",
  userName: "Alice",
  text: "Out of scope for this hackathon.",
  createdAt: REJECTED_AT,
  ...over,
})

const marker = (over: Record<string, unknown> = {}) =>
  comment({ text: "Project rejected", ...over })

describe("projectReviewFor", () => {
  // The reason the status is a parameter at all: `Reject` is the only writer of a
  // ProjectComment, so every other status has nothing to fetch and must not pay
  // for a round trip. This is what keeps the extra RPC off every project page.
  it.each([
    ["proposed", PROPOSED],
    ["approved", APPROVED],
  ])("makes no call for a %s project", async (_name, status) => {
    const get = vi.fn()

    expect(
      await projectReviewFor(grpcReturning(get), "p1", status),
    ).toBeUndefined()
    expect(get).not.toHaveBeenCalled()
  })

  // The shape the whole split exists for: the marker names who decided and when,
  // once, and the organiser's words sit under it — rather than both being notes
  // carrying the same byline twice.
  it("takes the attribution from the marker and the reason from the rest", async () => {
    const get = vi.fn().mockResolvedValue({
      project: {
        comments: [
          marker({ id: "c1" }),
          comment({ id: "c2", text: "Out of scope." }),
        ],
      },
    })

    const review = await projectReviewFor(grpcReturning(get), "p1", REJECTED)

    expect(get).toHaveBeenCalledWith({ projectId: "p1" })
    expect(review).toEqual({
      rejectedBy: "Alice",
      rejectedAt: REJECTED_AT,
      reasons: [{ id: "c2", text: "Out of scope." }],
    })
  })

  // Dropping the marker outright would have lost this: a rejection nobody gave a
  // reason for still says who turned it down and when, and the component fills
  // the gap with "No reason was given."
  it("still names the decider when no reason was given", async () => {
    const get = vi
      .fn()
      .mockResolvedValue({ project: { comments: [marker({ id: "c1" })] } })

    const review = await projectReviewFor(grpcReturning(get), "p1", REJECTED)

    expect(review).toEqual({
      rejectedBy: "Alice",
      rejectedAt: REJECTED_AT,
      reasons: [],
    })
  })

  // Matching on the text rather than taking the first comment: once a project has
  // been rejected, reconsidered and rejected again the markers are interleaved
  // with the reasons, and nothing on ProjectComment marks one. The last marker
  // wins, being the decision currently in force.
  it("attributes to the latest marker and keeps every reason", async () => {
    const later = new Date("2026-08-24T09:00:00Z")
    const get = vi.fn().mockResolvedValue({
      project: {
        comments: [
          marker({ id: "c1" }),
          comment({ id: "c2", text: "Too broad." }),
          marker({ id: "c3", userName: "Bob", createdAt: later }),
          comment({ id: "c4", text: "Still too broad." }),
        ],
      },
    })

    const review = await projectReviewFor(grpcReturning(get), "p1", REJECTED)

    expect(review).toMatchObject({ rejectedBy: "Bob", rejectedAt: later })
    expect(review?.reasons.map((r) => r.text)).toEqual([
      "Too broad.",
      "Still too broad.",
    ])
  })

  // A heading over an empty section would say less than the badge already does.
  it("returns nothing when the response carries no comments", async () => {
    const get = vi.fn().mockResolvedValue({ project: undefined })

    expect(
      await projectReviewFor(grpcReturning(get), "p1", REJECTED),
    ).toBeUndefined()
  })

  // This explains a decision the badge has already stated, so losing it degrades
  // the page rather than breaking it. Same treatment the preferences read gets on
  // the projects list.
  it("swallows an RPC failure rather than failing the page", async () => {
    const get = vi.fn().mockRejectedValue(new Error("unavailable"))

    expect(
      await projectReviewFor(grpcReturning(get), "p1", REJECTED),
    ).toBeUndefined()
  })
})
