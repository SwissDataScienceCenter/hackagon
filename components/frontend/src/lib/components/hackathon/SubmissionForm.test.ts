import { fireEvent, render, screen } from "@testing-library/svelte"
import { describe, expect, it, vi } from "vitest"

// The leave guard and the enhanced save need the router, which a component
// test has none of; what they do is the browser's business, not this file's.
vi.mock("$app/navigation", () => ({ beforeNavigate: () => {}, goto: () => {} }))
vi.mock("$app/forms", () => ({ enhance: () => ({ destroy: () => {} }) }))

import SubmissionForm from "./SubmissionForm.svelte"

const saved = {
  repositoryUrl: "https://github.com/byte-me/floods",
  attachmentFolderUrl: undefined,
  description: "Flood maps.",
  updatedAt: new Date("2026-08-01T10:00:00Z"),
  updatedBy: "Bob Henderson",
}

function renderForm(overrides = {}) {
  return render(SubmissionForm, {
    teamId: "team-1",
    projectId: "project-1",
    saved,
    ...overrides,
  })
}

const status = () => screen.getByRole("status")
const button = (name: string) => screen.getByRole("button", { name })
const repository = () =>
  screen.getByRole("textbox", { name: "Repository link" }) as HTMLInputElement

describe("SubmissionForm", () => {
  it("starts from the saved entry", () => {
    renderForm()

    expect(repository().value).toBe("https://github.com/byte-me/floods")
  })

  it("leaves out notes saved before links had to be https", () => {
    renderForm({ saved: { ...saved, repositoryUrl: "see the slides" } })

    expect(repository().value).toBe("")
  })

  describe("unsaved changes", () => {
    it("says when it was last saved, with nothing to save or discard", () => {
      renderForm()

      expect(status()).toHaveTextContent("No unsaved changes")
      expect(status()).toHaveTextContent("by Bob Henderson")
      expect(button("Save")).toBeDisabled()
      expect(button("Discard")).toBeDisabled()
    })

    it("says a team that never saved has not submitted", () => {
      renderForm({ saved: null })

      expect(status()).toHaveTextContent("Not submitted yet")
    })

    it("names the field Save would write", async () => {
      renderForm()

      await fireEvent.input(repository(), {
        target: { value: "https://github.com/byte-me/maps" },
      })

      expect(status()).toHaveTextContent("Unsaved changes: Repository link")
      expect(button("Save")).toBeEnabled()
      expect(button("Discard")).toBeEnabled()
    })

    it("does not count stray whitespace as a change", async () => {
      renderForm()

      await fireEvent.input(repository(), {
        target: { value: "https://github.com/byte-me/floods  " },
      })

      expect(status()).toHaveTextContent("No unsaved changes")
    })

    it("puts the saved entry back on Discard", async () => {
      renderForm()

      await fireEvent.input(repository(), {
        target: { value: "https://github.com/byte-me/maps" },
      })
      await fireEvent.click(button("Discard"))

      expect(repository().value).toBe("https://github.com/byte-me/floods")
      expect(status()).toHaveTextContent("No unsaved changes")
    })

    it("says why a save failed", () => {
      renderForm({
        message: "Saved, but not yet your team's entry — save again",
      })
      expect(screen.getByRole("alert")).toHaveTextContent("save again")
    })
  })
})
