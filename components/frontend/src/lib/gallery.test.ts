import { describe, expect, it } from "vitest"
import {
  altFromKey,
  formatBytes,
  normalizeImagePage,
  originOfKey,
} from "./gallery"

// `normalizeImagePage` is where a renamed field goes silently wrong: a listing
// would still count the right number of images and render a grid of broken
// frames, because `undefined` in an `<img src>` looks like a slow load. So every
// field is asserted with a value that could not be a default.

describe("normalizeImagePage", () => {
  it("reads every field a tile renders", () => {
    const page = normalizeImagePage({
      objects: [
        {
          key: "site/media/abc.webp",
          url: "/objects/hackagon-dev/site/media/abc.webp",
          sizeBytes: 20481,
          lastModified: "2026-08-11T09:15:42.000Z",
        },
      ],
      nextPageToken: "60",
      truncated: true,
    })

    expect(page.images).toHaveLength(1)
    expect(page.images[0]).toEqual({
      key: "site/media/abc.webp",
      url: "/objects/hackagon-dev/site/media/abc.webp",
      sizeBytes: 20481,
      lastModified: "2026-08-11T09:15:42.000Z",
    })
    expect(page.nextPageToken).toBe("60")
    expect(page.truncated).toBe(true)
  })

  it("accepts a byte count that arrived as a string", () => {
    // protobuf int64 crosses the wire as a string in some encodings; a tile
    // showing "NaN B" is the visible symptom and the number is load-bearing for
    // the table's size sort.
    const page = normalizeImagePage({
      objects: [{ key: "k", url: "/objects/b/k.webp", sizeBytes: "4096" }],
    })

    expect(page.images[0]?.sizeBytes).toBe(4096)
  })

  it("drops an entry with no url, which could only render as a hole", () => {
    const page = normalizeImagePage({
      objects: [
        { key: "a", url: "" },
        { key: "b" },
        null,
        { key: "c", url: "/objects/b/c.webp" },
      ],
    })

    expect(page.images.map((i) => i.key)).toEqual(["c"])
  })

  it("survives a body that is not a listing at all", () => {
    for (const body of [null, undefined, {}, { objects: "nope" }, 7]) {
      const page = normalizeImagePage(body)
      expect(page.images).toEqual([])
      expect(page.truncated).toBe(false)
      expect(page.nextPageToken).toBeUndefined()
    }
  })

  it("treats a missing next token as no next page, not as an empty string", () => {
    // The dialog renders "Load more" on truthiness, so an empty-string token
    // would offer a button that fetches page one again forever.
    const page = normalizeImagePage({
      objects: [],
      nextPageToken: "",
      truncated: false,
    })

    expect(page.nextPageToken).toBeUndefined()
  })
})

describe("originOfKey", () => {
  // The key IS the provenance record — that is the point of deriving the prefix
  // from the owning entity's id — so this reads it rather than storing a label.
  it("names the two hackathon prefixes apart and returns the event id", () => {
    expect(originOfKey("hackathons/1a2b/logo/x.webp")).toEqual({
      label: "Event logo",
      hackathonId: "1a2b",
    })
    expect(originOfKey("hackathons/1a2b/media/x.webp")).toEqual({
      label: "Event image",
      hackathonId: "1a2b",
    })
  })

  it("names the platform prefix, which has no owning event", () => {
    expect(originOfKey("site/media/x.webp")).toEqual({ label: "Platform page" })
  })

  it("recognizes the seeded covers, which are keyed by slug not by id", () => {
    // `just db::seed` writes hackathons/seed/<slug>/cover.webp because ids are
    // new on every reseed and the pictures are not. It matches neither shape
    // above and is not an orphan.
    expect(originOfKey("hackathons/seed/ai-2026/cover.webp")).toEqual({
      label: "Seeded cover",
    })
  })

  it("does not invent an event id for a key that has none", () => {
    expect(
      originOfKey("hackathons/seed/x/cover.webp").hackathonId,
    ).toBeUndefined()
    expect(originOfKey("something/else.webp")).toEqual({ label: "Uploaded" })
  })
})

describe("altFromKey", () => {
  it("describes where an image came from, since there is no filename to use", () => {
    // The key carries a server-chosen uuid on purpose, so nothing a user typed
    // reaches the store — which leaves the prefix as the only description
    // available.
    expect(altFromKey("hackathons/1/logo/x.webp")).toBe("Event logo")
    expect(altFromKey("hackathons/1/media/x.webp")).toBe("Event image")
    expect(altFromKey("site/media/x.webp")).toBe("Platform page image")
  })

  it("never returns an empty string", () => {
    // An empty alt on an image someone deliberately placed in prose is a hole
    // for anyone using a screen reader.
    for (const key of ["", "weird", "teams/1/submissions/2/x.webp"]) {
      expect(altFromKey(key)).not.toBe("")
    }
  })
})

describe("formatBytes", () => {
  it("scales into the unit a file manager would show", () => {
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(20481)).toBe("20.5 kB")
    expect(formatBytes(4_200_000)).toBe("4.2 MB")
  })

  it("says nothing rather than 0 when there is no size", () => {
    expect(formatBytes(0)).toBe("—")
    expect(formatBytes(Number.NaN)).toBe("—")
    expect(formatBytes(-1)).toBe("—")
  })
})
