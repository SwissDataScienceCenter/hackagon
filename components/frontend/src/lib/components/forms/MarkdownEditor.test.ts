import { fireEvent, render, screen } from "@testing-library/svelte"
import { tick } from "svelte"
import { describe, expect, it } from "vitest"

import MarkdownEditor from "./MarkdownEditor.svelte"

/*
 * The transforms themselves are covered in utils/markdownEdit.test.ts. What is
 * left to prove here is the wiring: that a click reaches the right transform,
 * that the result lands back in the textarea with the caret where the transform
 * asked for it, and that the form still sees one named field throughout.
 *
 * jsdom has no `execCommand`, so these exercise the fallback write path. The
 * `insertText` path it prefers in a real browser produces the same text — it
 * differs only in leaving the undo stack intact.
 */

/** Renders, then returns the textarea with `value` and selection already set. */
async function editing(value: string, start: number, end = start) {
  const { container } = render(MarkdownEditor, {
    props: { name: "description", maxlength: 100 },
  })
  const area = container.querySelector("textarea")!

  await fireEvent.input(area, { target: { value } })
  area.setSelectionRange(start, end)

  return { area, container }
}

const click = async (label: RegExp) => {
  await fireEvent.click(screen.getByLabelText(label))
  await tick()
}

describe("MarkdownEditor toolbar", () => {
  it("bolds the selection and leaves it selected", async () => {
    const { area } = await editing("hello world", 0, 5)

    await click(/^Bold/)

    expect(area.value).toBe("**hello** world")
    expect([area.selectionStart, area.selectionEnd]).toEqual([2, 7])
  })

  it("starts a list with the caret ready to type after the marker", async () => {
    const { area } = await editing("", 0)

    await click(/^Bulleted list/)

    expect(area.value).toBe("- ")
    expect(area.selectionStart).toBe(2)
  })

  it("responds to the keyboard shortcut as well as the button", async () => {
    const { area } = await editing("hello", 0, 5)

    await fireEvent.keyDown(area, { key: "b", ctrlKey: true })
    await tick()

    expect(area.value).toBe("**hello**")
  })

  it("continues a list on Enter and ends it on the second", async () => {
    const { area } = await editing("- milk", 6)

    await fireEvent.keyDown(area, { key: "Enter" })
    await tick()
    expect(area.value).toBe("- milk\n- ")

    area.setSelectionRange(9, 9)
    await fireEvent.keyDown(area, { key: "Enter" })
    await tick()
    expect(area.value).toBe("- milk\n")
  })

  it("leaves Enter alone in ordinary prose", async () => {
    const { area } = await editing("a sentence", 10)

    // Not prevented, so the browser inserts the newline itself — which jsdom
    // does not do, hence the value staying put rather than gaining one.
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    })
    area.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })
})

describe("MarkdownEditor panes", () => {
  it("renders markdown in the preview, with the list markers restored", async () => {
    const { container } = await editing("## Rules\n\n- Be kind", 0)

    await fireEvent.click(screen.getByText("Preview"))
    await tick()

    const body = container.querySelector(".markdown-body")!
    expect(body.querySelector("h2")?.textContent).toBe("Rules")
    expect(body.querySelector("li")?.textContent).toBe("Be kind")
  })

  it("keeps the field in the form while the preview is showing", async () => {
    const { container } = await editing("some text", 0)

    await fireEvent.click(screen.getByText("Preview"))
    await tick()

    const area = container.querySelector('textarea[name="description"]')
    expect(area).toBeInTheDocument()
    expect((area as HTMLTextAreaElement).value).toBe("some text")
  })

  it("disables the toolbar under the preview, where there is no caret", async () => {
    await editing("some text", 0)

    await fireEvent.click(screen.getByText("Preview"))
    await tick()

    expect(screen.getByLabelText(/^Bold/)).toBeDisabled()
  })
})
