import { render, screen } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"

import SubmissionContent from "./SubmissionContent.svelte"

/*
 * Only the fields that are filled in; a link only for what parses as one, since
 * an older version's repository field may hold notes.
 */

describe("SubmissionContent", () => {
  it("links both URLs and renders the description as Markdown", () => {
    render(SubmissionContent, {
      repositoryUrl: "https://github.com/byte-me/floods",
      attachmentFolderUrl: "https://drive.example.org/byte-me",
      description: "We built **flood maps**.",
    })

    const links = screen.getAllByRole("link")
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://github.com/byte-me/floods",
      "https://drive.example.org/byte-me",
    ])
    expect(links[0]?.getAttribute("rel")).toBe("noopener noreferrer")
    expect(screen.getByText("flood maps").tagName).toBe("STRONG")
  })

  it("shows notes from before links were required as text, not a link", () => {
    render(SubmissionContent, { repositoryUrl: "Repo is private, ask us" })

    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.getByText("Repo is private, ask us")).toBeTruthy()
  })

  it("says so when nothing is filled in", () => {
    render(SubmissionContent, {})

    expect(screen.getByText("Nothing filled in on this version.")).toBeTruthy()
  })

  it("folds the description behind a toggle when asked to", () => {
    render(SubmissionContent, {
      description: "We built **flood maps**.",
      collapseDescription: true,
    })

    const details = screen.getByText("flood maps").closest("details")
    expect(details).not.toBeNull()
    expect(details?.open).toBe(false)
    expect(screen.getByText("Description").tagName).toBe("SUMMARY")
  })

  it("does not say so when only the description is filled in", () => {
    render(SubmissionContent, { description: "Just notes" })

    expect(screen.queryByText("Nothing filled in on this version.")).toBeNull()
    expect(screen.queryByRole("link")).toBeNull()
  })
})
