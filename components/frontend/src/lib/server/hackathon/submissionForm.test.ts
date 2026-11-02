import { describe, it, expect } from "vitest"
import { parseSubmissionForm } from "./submissionForm"

function form(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)

  return f
}

describe("parseSubmissionForm", () => {
  it("takes all three fields, trimmed", () => {
    expect(
      parseSubmissionForm(
        form({
          repositoryUrl: "  https://github.com/byte-me/floods ",
          attachmentFolderUrl: "https://drive.example.org/floods",
          description: "\nFlood maps.\n",
        }),
      ),
    ).toEqual({
      ok: true,
      values: {
        repositoryUrl: "https://github.com/byte-me/floods",
        attachmentFolderUrl: "https://drive.example.org/floods",
        description: "Flood maps.",
      },
    })
  })

  it("leaves a blank field out rather than sending an empty string", () => {
    expect(
      parseSubmissionForm(form({ repositoryUrl: "   ", description: "Notes" })),
    ).toEqual({
      ok: true,
      values: {
        repositoryUrl: undefined,
        attachmentFolderUrl: undefined,
        description: "Notes",
      },
    })
  })

  it("accepts any one field on its own", () => {
    expect(
      parseSubmissionForm(
        form({ attachmentFolderUrl: "https://drive.example.org/x" }),
      ).ok,
    ).toBe(true)
  })

  it("refuses a version with nothing in it", () => {
    expect(
      parseSubmissionForm(
        form({ repositoryUrl: "", attachmentFolderUrl: " ", description: "" }),
      ),
    ).toEqual({
      ok: false,
      message: "Add a repository link, an attachments link or a description",
    })
  })

  it("names the repository link when it is not https", () => {
    expect(
      parseSubmissionForm(form({ repositoryUrl: "http://github.com/x" })),
    ).toEqual({
      ok: false,
      message: "The repository link must start with https://",
    })
  })

  it("names the attachments link when it is not https", () => {
    expect(
      parseSubmissionForm(
        form({
          repositoryUrl: "https://github.com/x",
          attachmentFolderUrl: "drive.example.org/x",
        }),
      ),
    ).toEqual({
      ok: false,
      message: "The attachments link must start with https://",
    })
  })

  it("refuses a link over the backend's limit", () => {
    const long = `https://example.org/${"a".repeat(2048)}`

    expect(parseSubmissionForm(form({ repositoryUrl: long }))).toEqual({
      ok: false,
      message: "The repository link must be at most 2048 characters",
    })
  })

  it("refuses a description over the backend's limit", () => {
    expect(
      parseSubmissionForm(form({ description: "a".repeat(10001) })),
    ).toEqual({
      ok: false,
      message: "The description must be at most 10000 characters",
    })
  })
})
