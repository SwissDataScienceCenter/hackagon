/**
 * The editor's toolbar, wired up.
 *
 * The transformations are pure functions with their own tests
 * (`$lib/utils/markdownEdit`, `$lib/utils/markdownTable`). What is only true
 * once mounted is that each BUTTON reaches the right one of them, that it acts
 * on the selection the textarea is holding, and — the claim the table button
 * actually makes — that what it inserts renders in the Preview pane as a real
 * `<table>` with the right number of rows and columns. "The markdown contains
 * pipes" is a different claim, and a weaker one.
 *
 * Note the difference from the Playwright specs: `getByRole(role, {name})` here
 * matches the accessible name EXACTLY (DOM Testing Library compares the whole
 * string), whereas Playwright's is a case-insensitive substring. A toolbar of
 * twelve short names is exactly where that bites.
 */

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte"
import { tick } from "svelte"
import MarkdownEditor from "./MarkdownEditor.svelte"

// No auto-cleanup is configured, so a second render in the same file would
// leave two editors mounted and every query would be ambiguous.
afterEach(cleanup)

function mount(value = "") {
  render(MarkdownEditor, { props: { name: "content", id: "content", value } })
  const area = screen.getByRole("textbox", {
    name: "",
  }) as HTMLTextAreaElement
  return area
}

/** The main field. Named by `id`, because the paste panel adds a second
 *  textarea and "the one with name=content" is the document. */
function field(): HTMLTextAreaElement {
  const el = document.querySelector("textarea[name=content]")
  if (!el) throw new Error("the editor's textarea is not mounted")
  return el as HTMLTextAreaElement
}

/** Type into the field the way a person would, then place the selection. */
async function type(value: string, start?: number, end?: number) {
  const area = field()
  await fireEvent.input(area, { target: { value } })
  area.focus()
  area.setSelectionRange(start ?? value.length, end ?? start ?? value.length)
  return area
}

async function press(name: string) {
  await fireEvent.click(screen.getByRole("button", { name }))
  // `apply()` awaits a tick before restoring the selection.
  await tick()
  await tick()
}

const selectionOf = (area: HTMLTextAreaElement) =>
  area.value.slice(area.selectionStart, area.selectionEnd)

describe("MarkdownEditor: the toolbar is wired to the field", () => {
  it("wraps a selection in bold and keeps the words selected", async () => {
    mount()
    const area = await type("hello world", 6, 11)

    await press("Bold")

    expect(area.value).toBe("hello **world**")
    // The markers are not part of the selection, so pressing again toggles the
    // same words rather than nesting.
    expect(selectionOf(area)).toBe("world")
  })

  it("opens an empty pair at a bare caret and sits between them", async () => {
    mount()
    const area = await type("", 0, 0)

    await press("Bold")

    expect(area.value).toBe("****")
    expect(area.selectionStart).toBe(2)
    expect(area.selectionEnd).toBe(2)
  })

  it("unwraps on a second press", async () => {
    mount()
    const area = await type("hello world", 6, 11)

    await press("Bold")
    await press("Bold")

    expect(area.value).toBe("hello world")
  })

  it("does not confuse italic with bold", async () => {
    mount()
    // `world` is 8..13 — the two asterisks are 6 and 7.
    const area = await type("hello **world** here", 8, 13)

    await press("Italic")

    expect(area.value).toBe("hello ***world*** here")
  })

  it("re-levels a heading instead of stacking hashes", async () => {
    mount()
    const area = await type("Title", 2, 2)

    await press("Heading 2")
    expect(area.value).toBe("## Title")

    await press("Heading 3")
    expect(area.value).toBe("### Title")

    await press("Heading 3")
    expect(area.value).toBe("Title")
  })

  it("lists every line the selection touches, and converts between kinds", async () => {
    mount()
    const area = await type("one\ntwo\nthree", 0, 13)

    await press("Numbered list")
    expect(area.value).toBe("1. one\n2. two\n3. three")

    await press("Bulleted list")
    expect(area.value).toBe("- one\n- two\n- three")
  })

  it("quotes, inline-codes and fences", async () => {
    mount()
    const area = await type("note", 0, 4)

    await press("Quote")
    expect(area.value).toBe("> note")

    await type("code", 0, 4)
    await press("Inline code")
    expect(area.value).toBe("`code`")

    await type("const x = 1", 0, 11)
    await press("Code block")
    expect(area.value).toBe("```\nconst x = 1\n```")
  })

  it("links the selection and selects the URL to type over", async () => {
    mount()
    const area = await type("see the docs", 8, 12)

    await press("Link")

    expect(area.value).toBe("see the [docs](url)")
    expect(selectionOf(area)).toBe("url")
  })

  it("answers Ctrl+B, Ctrl+I and Ctrl+K from the field itself", async () => {
    mount()
    const area = await type("hi", 0, 2)

    await fireEvent.keyDown(area, { key: "b", ctrlKey: true })
    await tick()
    expect(area.value).toBe("**hi**")

    await type("hi", 0, 2)
    await fireEvent.keyDown(area, { key: "i", ctrlKey: true })
    await tick()
    expect(area.value).toBe("*hi*")

    await type("docs", 0, 4)
    await fireEvent.keyDown(area, { key: "k", ctrlKey: true })
    await tick()
    expect(area.value).toBe("[docs](url)")
  })

  it("ignores a plain keypress and a modified one it does not own", async () => {
    mount()
    const area = await type("hi", 0, 2)

    await fireEvent.keyDown(area, { key: "b" })
    await fireEvent.keyDown(area, { key: "b", ctrlKey: true, shiftKey: true })
    await fireEvent.keyDown(area, { key: "b", ctrlKey: true, altKey: true })
    await tick()

    expect(area.value).toBe("hi")
  })
})

describe("MarkdownEditor: toolbar accessibility", () => {
  it("is a labelled toolbar naming the field it edits", () => {
    mount()
    const toolbar = screen.getByRole("toolbar", { name: "Formatting" })

    expect(toolbar).toBeInTheDocument()
    expect(toolbar).toHaveAttribute("aria-controls", "content")
  })

  it("gives every control an accessible name of its own", () => {
    mount()
    for (const name of [
      "Bold",
      "Italic",
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Link",
      "Bulleted list",
      "Numbered list",
      "Quote",
      "Inline code",
      "Code block",
      "Paste a table",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument()
    }
  })

  it("is a single tab stop with the rest reached by arrow key", async () => {
    mount()
    const toolbar = screen.getByRole("toolbar", { name: "Formatting" })
    const buttons = Array.from(toolbar.querySelectorAll("button"))

    expect(buttons).toHaveLength(12)
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1)
    expect(buttons.filter((b) => b.tabIndex === -1)).toHaveLength(11)

    const bold = screen.getByRole("button", { name: "Bold" })
    bold.focus()
    await fireEvent.keyDown(bold, { key: "ArrowRight" })
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Italic" }),
    )

    await fireEvent.keyDown(document.activeElement!, { key: "End" })
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Paste a table" }),
    )

    // Wraps, so the toolbar cannot dead-end.
    await fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" })
    expect(document.activeElement).toBe(bold)
  })

  it("keeps the external label pointed at the textarea, not at a button", () => {
    // Buttons are labelable, so a control added above the field can silently
    // steal a `<label for=…>`. The id must stay on the textarea.
    mount()
    const labelled = document.getElementById("content")

    expect(labelled?.tagName).toBe("TEXTAREA")
    expect(labelled).toHaveAttribute("name", "content")
  })

  it("hides the toolbar over the Preview pane but keeps the field submittable", async () => {
    mount("hello")

    await fireEvent.click(screen.getByRole("button", { name: "Preview" }))
    await tick()

    expect(
      screen.queryByRole("toolbar", { name: "Formatting" }),
    ).not.toBeInTheDocument()
    // The value still has to reach the form; the textarea is only hidden.
    expect(field().value).toBe("hello")
  })
})

describe("MarkdownEditor: paste a table", () => {
  /** Open the panel and return its paste target. */
  async function openPanel() {
    await fireEvent.click(screen.getByRole("button", { name: "Paste a table" }))
    await tick()
    const panel = screen.getByRole("group", { name: "Paste a table" })
    const paste = panel.querySelector("textarea")
    if (!paste) throw new Error("the paste panel has no textarea")
    return { panel, paste: paste as HTMLTextAreaElement }
  }

  async function fillPaste(paste: HTMLTextAreaElement, value: string) {
    await fireEvent.input(paste, { target: { value } })
    await tick()
  }

  it("reads the shape back before anything is inserted", async () => {
    mount()
    const { panel, paste } = await openPanel()

    expect(panel).toHaveTextContent("Nothing pasted yet.")
    await fillPaste(paste, "Name\tRole\nAlice\tOrganizer\nBob\tParticipant")

    // "It inserted something" and "it found two columns" are different claims.
    expect(panel).toHaveTextContent("2 columns × 2 rows")
    expect(panel).toHaveTextContent("separated by tab")
  })

  it("refuses to insert nothing", async () => {
    mount()
    const { panel } = await openPanel()

    expect(
      panel.querySelector("button[disabled]")?.textContent?.trim(),
    ).toBe("Insert table")
  })

  it("inserts a table the Preview pane renders as a real <table>", async () => {
    mount()
    const { paste } = await openPanel()

    // Tab-separated, as a spreadsheet selection arrives, with a literal pipe in
    // one cell: unescaped it would end that cell and shift every column after
    // it — silently, in the middle of the data.
    await fillPaste(paste, "Track\tLead\nClimate\tAlice\na|b\tBob")
    await fireEvent.click(screen.getByRole("button", { name: "Insert table" }))
    await tick()
    await tick()

    const value = field().value
    expect(value).toMatch(/\| Track\s+\| Lead\s+\|/)
    expect(value).toMatch(/\| a\\\|b\s+\| Bob\s+\|/)

    await fireEvent.click(screen.getByRole("button", { name: "Preview" }))
    await tick()

    const table = document.querySelector(".markdown-content table")
    expect(table).not.toBeNull()
    expect(table!.querySelectorAll("thead th")).toHaveLength(2)
    const rows = Array.from(table!.querySelectorAll("tbody tr"))
    expect(rows).toHaveLength(2)
    expect(rows[0]?.querySelectorAll("td")).toHaveLength(2)
    expect(table!.querySelectorAll("thead th")[0]?.textContent).toBe("Track")
    // One cell, not two: the escape held through marked AND DOMPurify.
    const escaped = rows[1]?.querySelectorAll("td")
    expect(escaped).toHaveLength(2)
    expect(escaped?.[0]?.textContent).toBe("a|b")
  })

  it("keeps a quoted comma inside its cell when converting CSV", async () => {
    mount()
    const { panel, paste } = await openPanel()

    await fillPaste(paste, 'City,Country\n"Lausanne, VD",CH')
    expect(panel).toHaveTextContent("separated by comma")

    await fireEvent.click(screen.getByRole("button", { name: "Insert table" }))
    await tick()
    await fireEvent.click(screen.getByRole("button", { name: "Preview" }))
    await tick()

    const cells = document.querySelectorAll(".markdown-content tbody td")
    expect(cells).toHaveLength(2)
    expect(cells[0]?.textContent).toBe("Lausanne, VD")
  })

  it("flags an ambiguous separator and lets it be overruled", async () => {
    mount()
    const { panel, paste } = await openPanel()

    // European CSV: `;` between the fields, `,` as the decimal mark. Both
    // produce a consistent grid, so this genuinely needs a person.
    await fillPaste(paste, "1,5;2,5\n3,5;4,5")
    expect(panel).toHaveTextContent("More than one separator fits")
    expect(panel).toHaveTextContent("2 columns × 1 row")

    const select = panel.querySelector("select")!
    await fireEvent.change(select, { target: { value: "," } })
    await tick()

    expect(panel).toHaveTextContent("3 columns × 1 row")
    // An explicit choice is not ambiguous by definition.
    expect(panel).not.toHaveTextContent("More than one separator fits")
  })

  it("gives header-less data an empty header row, keeping every row", async () => {
    mount()
    const { panel, paste } = await openPanel()

    await fillPaste(paste, "Alice\tOrganizer\nBob\tParticipant")
    expect(panel).toHaveTextContent("2 columns × 1 row")

    await fireEvent.click(
      screen.getByRole("checkbox", { name: "First row is a header" }),
    )
    await tick()
    expect(panel).toHaveTextContent("2 columns × 2 rows")

    await fireEvent.click(screen.getByRole("button", { name: "Insert table" }))
    await tick()
    await fireEvent.click(screen.getByRole("button", { name: "Preview" }))
    await tick()

    expect(
      document.querySelectorAll(".markdown-content tbody tr"),
    ).toHaveLength(2)
    expect(
      document.querySelector(".markdown-content thead th")?.textContent,
    ).toBe("")
  })

  it("separates the table from the paragraph above it", async () => {
    // Glued to a paragraph, markdown reads the table as more paragraph — and
    // then the Preview shows a line of pipes rather than a table.
    mount()
    await type("Here are the tracks:")
    const { paste } = await openPanel()

    await fillPaste(paste, "a\tb")
    await fireEvent.click(screen.getByRole("button", { name: "Insert table" }))
    await tick()
    await tick()

    expect(field().value).toMatch(/^Here are the tracks:\n\n\| a\s+\| b\s+\|/)

    await fireEvent.click(screen.getByRole("button", { name: "Preview" }))
    await tick()
    expect(document.querySelector(".markdown-content table")).not.toBeNull()
  })

  it("lands at the caret, not at the end, even though the panel took focus", async () => {
    // Opening the panel moves focus off the field. The selection survives on a
    // blurred textarea, which is the only reason reading it later works — if
    // that ever stops holding, every insert silently goes to the end of the
    // document instead of where the caret was.
    mount()
    await type("before\n\nafter", 8, 8)
    const { paste } = await openPanel()

    await fillPaste(paste, "a\tb")
    await fireEvent.click(screen.getByRole("button", { name: "Insert table" }))
    await tick()
    await tick()

    expect(field().value).toMatch(/^before\n\n\| a\s+\| b\s+\|\n\| -+ \| -+ \|\n\nafter$/)
  })

  it("closes on Escape and gives focus back to the control that opened it", async () => {
    mount()
    await openPanel()

    await fireEvent.keyDown(window, { key: "Escape" })
    await tick()

    expect(
      screen.queryByRole("group", { name: "Paste a table" }),
    ).not.toBeInTheDocument()
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Paste a table" }),
    )
  })

  it("says so rather than inserting past the field's maxlength", async () => {
    // A programmatic insert bypasses maxlength — the browser only enforces it
    // against typing — so without this the field submits a value the server
    // rejects.
    render(MarkdownEditor, {
      props: { name: "content", id: "content", maxlength: 20 },
    })
    const { panel, paste } = await openPanel()

    await fillPaste(paste, "Track\tLead\nClimate\tAlice")

    expect(panel).toHaveTextContent("past its 20-character limit")
    expect(screen.getByRole("button", { name: "Insert table" })).toBeDisabled()
  })
})
