// Our own words for a form that failed its own checks, so the browser never
// says them for us.
//
// A `required` control makes the browser refuse the submission and draw a
// tooltip beside the field — "Please select an item in the list." No stylesheet
// can reach that tooltip: it is painted outside the page in every current
// browser (Chrome's `::-webkit-validation-bubble` pseudo-elements were removed,
// and the others never had an equivalent). So the only way to say it in the
// app's own voice is to stop the browser saying it at all — `novalidate` on the
// form — and to ask the same Constraint Validation API the browser was using.
//
// This changes who speaks, not what is enforced. The `required` attributes stay
// exactly where they were, and the backend repeats every check on the way in;
// this only decides how quickly, and how legibly, the person hears about it.

/** A form control the browser will validate, as opposed to a fieldset or button. */
type ValidatableControl =
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement

export interface FormCheck {
  /** One message per control that failed, keyed by the control's `name`. */
  messages: Record<string, string>
  /**
   * The first control that failed, to put the cursor back on — undefined when
   * the form is fine, which is also the caller's "let the submit through".
   */
  first?: ValidatableControl
}

/**
 * What is wrong with `form`, in our wording, without submitting it.
 *
 * Reads `validity` rather than calling `checkValidity()`, which would fire an
 * `invalid` event at every failing control on the way past — the form is being
 * inspected here, not rejected.
 */
export function checkForm(form: HTMLFormElement): FormCheck {
  const messages: Record<string, string> = {}
  let first: ValidatableControl | undefined

  for (const element of Array.from(form.elements)) {
    if (!isValidatable(element)) continue
    // `willValidate` is false for a disabled or readonly control, which is how a
    // field shown but not editable stays out of this.
    if (!element.willValidate || element.validity.valid) continue

    first ??= element
    // A control with no name carries nothing to the server, so there is nowhere
    // to hang its message; radio groups share one name and the first wins.
    if (element.name && !(element.name in messages)) {
      messages[element.name] = fieldMessage(element)
    }
  }

  return { messages, first }
}

/**
 * What to say about one failing control.
 *
 * Only the empty-required case is worded here, because it is the one every form
 * in the app can hit. Anything else — a malformed email, a value over
 * `maxlength` — falls back to the browser's own sentence, which is at least
 * accurate and localised; it just gets rendered in our own type instead of in a
 * tooltip we cannot touch.
 */
export function fieldMessage(control: ValidatableControl): string {
  if (!control.validity.valueMissing) return control.validationMessage

  if (control instanceof HTMLSelectElement) return "Choose one of the options."
  if (control instanceof HTMLInputElement && control.type === "checkbox") {
    return "Tick this to carry on."
  }
  return "This one needs an answer."
}

function isValidatable(element: Element): element is ValidatableControl {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  )
}
