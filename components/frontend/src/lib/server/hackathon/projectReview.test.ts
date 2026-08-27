import { describe, it, expect, vi } from "vitest"
import type { AuthorizedGrpc } from "$lib/server/grpc/client"
import { reviewNotesFor } from "./projectReview"

// Numeric enum values, spelled out so a fixture reads as the case it stands for.
// ProjectStatus: PROPOSED=1, APPROVED=2, REJECTED=3.
const PROPOSED = 1
const APPROVED = 2
const REJECTED = 3

/** A grpc double exposing only `project.get`, which is all this reads. */
const grpcReturning = (get: ReturnType<typeof vi.fn>) =>
  ({ project: { get } }) as unknown as AuthorizedGrpc

const comment = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  userId: "user-alice",
  userName: "Alice",
  text: "Out of scope for this hackathon.",
  createdAt: new Date("2026-08-20T10:00:00Z"),
  ...over,
})

describe("reviewNotesFor", () => {
  // The reason the status is a parameter at all: `Reject` is the only writer of a
  // ProjectComment, so every other status has nothing to fetch and must not pay
  // for a round trip. This is what keeps the extra RPC off every project page.
  it.each([
    ["proposed", PROPOSED],
    ["approved", APPROVED],
  ])("makes no call for a %s project", async (_name, status) => {
    const get = vi.fn()

    expect(await reviewNotesFor(grpcReturning(get), "p1", status)).toEqual([])
    expect(get).not.toHaveBeenCalled()
  })

  it("maps the notes on a rejected project, in the order they arrived", async () => {
    const get = vi.fn().mockResolvedValue({
      project: {
        comments: [
          comment({ id: "c1", text: "Project rejected" }),
          comment({ id: "c2", text: "Out of scope." }),
        ],
      },
    })

    const notes = await reviewNotesFor(grpcReturning(get), "p1", REJECTED)

    expect(get).toHaveBeenCalledWith({ projectId: "p1" })
    // The sentinel note is kept, not filtered: it is the only record of who
    // rejected the project and when, since `Project` carries no rejectedBy.
    expect(notes.map((n) => n.text)).toEqual([
      "Project rejected",
      "Out of scope.",
    ])
    expect(notes[0]).toMatchObject({
      id: "c1",
      author: "Alice",
      createdAt: new Date("2026-08-20T10:00:00Z"),
    })
  })

  // A rejection with no reason given leaves exactly one note, and a project whose
  // comments the backend returns as absent must not throw on the way through.
  it("survives a response carrying no comments", async () => {
    const get = vi.fn().mockResolvedValue({ project: undefined })

    expect(await reviewNotesFor(grpcReturning(get), "p1", REJECTED)).toEqual([])
  })

  // The notes explain a decision the badge has already stated, so losing them
  // degrades the page rather than breaking it. Same treatment the preferences
  // read gets on the projects list.
  it("swallows an RPC failure rather than failing the page", async () => {
    const get = vi.fn().mockRejectedValue(new Error("unavailable"))

    expect(await reviewNotesFor(grpcReturning(get), "p1", REJECTED)).toEqual([])
  })
})
