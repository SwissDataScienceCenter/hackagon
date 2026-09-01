import { describe, it, expect } from "vitest"
import { checkForm, fieldMessage } from "./formValidation"

/** A form built from markup, the way the register page renders it. */
function formOf(html: string): HTMLFormElement {
  document.body.innerHTML = `<form>${html}</form>`
  return document.body.querySelector("form")!
}

describe("checkForm", () => {
  it("names every empty required field, keyed by its form field name", () => {
    const form = formOf(`
      <select name="answer:size" required><option value="">Choose one…</option></select>
      <input type="checkbox" name="answer:coc" required />
      <input type="text" name="answer:diet" value="vegan" />
    `)

    const { messages } = checkForm(form)

    // The answered optional field is absent, not present-and-empty: the page
    // renders a message for whatever this returns.
    expect(messages).toEqual({
      "answer:size": "Choose one of the options.",
      "answer:coc": "Tick this to carry on.",
    })
  })

  it("reports the first failing control so the cursor can go back to it", () => {
    const form = formOf(`
      <input type="text" name="answer:name" value="Alice" required />
      <select name="answer:size" required><option value="">Choose one…</option></select>
      <input type="checkbox" name="answer:coc" required />
    `)

    expect(checkForm(form).first?.name).toBe("answer:size")
  })

  it("passes a complete form, which is how the submit gets through", () => {
    const form = formOf(`
      <select name="answer:size" required>
        <option value="">Choose one…</option>
        <option value="M" selected>M</option>
      </select>
      <input type="checkbox" name="answer:coc" required checked />
    `)

    const { messages, first } = checkForm(form)

    expect(messages).toEqual({})
    expect(first).toBeUndefined()
  })

  it("ignores a field that is shown but not editable", () => {
    // Someone else's answers are rendered by the same component with
    // `readonly`/`disabled`, and an empty one of those is not the visitor's
    // problem to fix.
    const form = formOf(`
      <input type="text" name="answer:theirs" required readonly />
      <select name="answer:theirsize" required disabled><option value="">—</option></select>
    `)

    expect(checkForm(form)).toEqual({ messages: {}, first: undefined })
  })
})

describe("fieldMessage", () => {
  it("falls back to the browser's sentence for anything but an empty field", () => {
    // Not worth re-wording every constraint in the platform: an email or
    // maxlength failure keeps the browser's own text, and only moves out of the
    // tooltip and into our own type.
    const form = formOf(`<input type="email" name="e" value="not-an-email" />`)
    const control = form.elements[0] as HTMLInputElement

    expect(control.validity.typeMismatch).toBe(true)
    expect(fieldMessage(control)).toBe(control.validationMessage)
  })
})
