import { describe, it, expect } from "vitest"
import { adviseImageUrl, usableImage } from "./imageUrl"

describe("adviseImageUrl", () => {
  it("says nothing about an empty field", () => {
    expect(adviseImageUrl("")).toEqual({})
    expect(adviseImageUrl("   ")).toEqual({})
  })

  it("says nothing about an ordinary image address", () => {
    expect(adviseImageUrl("https://example.org/logo.png")).toEqual({})
  })

  it("ignores surrounding whitespace from a paste", () => {
    expect(adviseImageUrl("  https://example.org/logo.png  ")).toEqual({})
  })

  it("rejects what is not a web address", () => {
    expect(adviseImageUrl("logo.png").problem).toMatch(/https:\/\//)
    expect(adviseImageUrl("/images/logos/psi.svg").problem).toMatch(
      /https:\/\//,
    )
  })

  it("rejects a non-http scheme", () => {
    expect(adviseImageUrl("javascript:alert(1)").problem).toBeDefined()
    expect(adviseImageUrl("data:image/png;base64,AAAA").problem).toBeDefined()
  })

  it("turns a GitHub blob page into its raw address", () => {
    expect(
      adviseImageUrl("https://github.com/acme/site/blob/main/docs/logo.png"),
    ).toEqual({
      problem: expect.stringContaining("GitHub"),
      direct: "https://raw.githubusercontent.com/acme/site/main/docs/logo.png",
    })
  })

  it("leaves a raw.githubusercontent address alone", () => {
    expect(
      adviseImageUrl(
        "https://raw.githubusercontent.com/acme/site/main/logo.png",
      ),
    ).toEqual({})
  })

  it("leaves a GitHub address that is not a blob page alone", () => {
    expect(adviseImageUrl("https://github.com/acme/site")).toEqual({})
  })

  it("turns a Dropbox share link into the inline form", () => {
    const advice = adviseImageUrl("https://www.dropbox.com/s/abc/logo.png?dl=0")
    expect(advice.problem).toContain("Dropbox")
    expect(advice.direct).toBe("https://www.dropbox.com/s/abc/logo.png?raw=1")
  })

  it("leaves a Dropbox link that already asks for raw alone", () => {
    expect(
      adviseImageUrl("https://www.dropbox.com/s/abc/logo.png?raw=1"),
    ).toEqual({})
  })

  it("refuses Google Drive without offering a rewrite", () => {
    const advice = adviseImageUrl(
      "https://drive.google.com/file/d/1AbC/view?usp=sharing",
    )
    expect(advice.problem).toContain("Drive")
    expect(advice.direct).toBeUndefined()
  })

  it("names the other share-link hosts", () => {
    expect(
      adviseImageUrl("https://photos.app.goo.gl/abc").problem,
    ).toBeDefined()
    expect(adviseImageUrl("https://1drv.ms/i/s!abc").problem).toBeDefined()
    expect(
      adviseImageUrl("https://acme.sharepoint.com/sites/x/logo.png").problem,
    ).toBeDefined()
    expect(adviseImageUrl("https://imgur.com/a/abc").problem).toBeDefined()
    expect(
      adviseImageUrl("https://www.flickr.com/photos/someone/123").problem,
    ).toBeDefined()
    expect(
      adviseImageUrl("https://unsplash.com/photos/a-cat-abc123").problem,
    ).toBeDefined()
  })

  it("leaves the image hosts of those services alone", () => {
    expect(adviseImageUrl("https://i.imgur.com/abc.png")).toEqual({})
    expect(adviseImageUrl("https://live.staticflickr.com/1/2_b.jpg")).toEqual(
      {},
    )
    expect(adviseImageUrl("https://images.unsplash.com/photo-123")).toEqual({})
  })

  it("does not mistake a lookalike domain for the real host", () => {
    // `endsWith('.github.com')` rather than `includes('github.com')`: a host
    // ending in `notgithub.com` is somebody else's site entirely.
    expect(
      adviseImageUrl("https://notgithub.com/acme/site/blob/main/logo.png"),
    ).toEqual({})
  })
})

describe("usableImage", () => {
  it("refuses an absent or empty address", () => {
    expect(usableImage(undefined, undefined)).toBe(false)
    expect(usableImage("", undefined)).toBe(false)
  })

  it("accepts an address that has not failed", () => {
    expect(usableImage("https://example.org/a.png", undefined)).toBe(true)
  })

  it("refuses the exact address that failed", () => {
    expect(
      usableImage("https://example.org/a.png", "https://example.org/a.png"),
    ).toBe(false)
  })

  it("tries a corrected address even though the previous one failed", () => {
    expect(
      usableImage("https://example.org/b.png", "https://example.org/a.png"),
    ).toBe(true)
  })
})
