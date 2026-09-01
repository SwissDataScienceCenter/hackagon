import { describe, expect, it } from "vitest"

import { linkify } from "./linkify"

/** The hrefs found, in order — most cases only care about these. */
const links = (text: string) =>
  linkify(text)
    .filter((s) => s.kind === "link")
    .map((s) => s.href)

/** Everything a reader would see, links included, back as one string. */
const spoken = (text: string) =>
  linkify(text)
    .map((s) => (s.kind === "link" ? s.href : s.value))
    .join("")

describe("linkify", () => {
  it("leaves an answer with no address as one run of text", () => {
    expect(linkify("I have been to three of these.")).toEqual([
      { kind: "text", value: "I have been to three of these." },
    ])
  })

  it("has nothing to say about an empty answer", () => {
    expect(linkify("")).toEqual([])
  })

  it("finds an address on its own", () => {
    expect(linkify("https://example.dev")).toEqual([
      { kind: "link", href: "https://example.dev" },
    ])
  })

  it("keeps the words on either side of an address", () => {
    expect(linkify("see https://example.dev for more")).toEqual([
      { kind: "text", value: "see " },
      { kind: "link", href: "https://example.dev" },
      { kind: "text", value: " for more" },
    ])
  })

  it("finds every address in an answer", () => {
    expect(links("https://a.dev and http://b.dev/x?y=1")).toEqual([
      "https://a.dev",
      "http://b.dev/x?y=1",
    ])
  })

  it("leaves the full stop to the sentence", () => {
    expect(linkify("mine is https://example.dev/me.")).toEqual([
      { kind: "text", value: "mine is " },
      { kind: "link", href: "https://example.dev/me" },
      { kind: "text", value: "." },
    ])
  })

  it("leaves a comma between two addresses to the sentence", () => {
    expect(links("https://a.dev, https://b.dev")).toEqual([
      "https://a.dev",
      "https://b.dev",
    ])
  })

  it("keeps parens the address opened and drops the ones it did not", () => {
    expect(links("(https://en.wikipedia.org/wiki/Foo_(bar))")).toEqual([
      "https://en.wikipedia.org/wiki/Foo_(bar)",
    ])
  })

  it("drops a closing paren and the full stop after it", () => {
    expect(links("(https://example.dev/a).")).toEqual(["https://example.dev/a"])
  })

  it("refuses a scheme that is not a way of fetching a page", () => {
    // The whole point of the http(s)-only pattern: this is never a candidate,
    // so it cannot be a link however the rest of the answer is written.
    expect(links("javascript:alert(1)")).toEqual([])
    expect(links("data:text/html,<script>alert(1)</script>")).toEqual([])
    expect(links("file:///etc/passwd")).toEqual([])
  })

  it("leaves markup in an answer as the text it is", () => {
    const answer = "<script>alert(1)</script> https://example.dev"
    expect(links(answer)).toEqual(["https://example.dev"])
    expect(spoken(answer)).toBe(answer)
  })

  it("does not take a scheme with no host for an address", () => {
    expect(links("write https:// in front of it")).toEqual([])
  })

  it("does not mistake a filename for an address", () => {
    expect(links("I mostly write node.js and some main.go")).toEqual([])
  })

  it("gives back every character it was handed", () => {
    const answer =
      "repo: https://github.com/me/x (see the README), site https://me.dev/. thanks!"
    expect(spoken(answer)).toBe(answer)
  })
})
