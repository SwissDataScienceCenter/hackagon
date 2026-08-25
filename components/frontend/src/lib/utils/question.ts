// The client-safe half of a registration question: the kinds an organizer can
// choose between, and what to call them on screen.
//
// Pairs with $lib/server/hackathon/registrationForm, which owns the generated
// `QuestionType` enum and therefore must never be imported by a component. The
// kind crosses that boundary as a plain string so a `.svelte` file never needs
// the enum at all.

/** A question's answer shape, as a string the browser can round-trip. */
export type QuestionKind = "text" | "bool" | "enum"

export interface QuestionKindOption {
  value: QuestionKind
  label: string
  /** One line under the picker saying what the answer will look like. */
  hint: string
}

/**
 * The three kinds, in the order the picker offers them: text first because it is
 * the common case, the tick-box next because a code of conduct is the second
 * thing every event asks, and the fixed list last because it is the only one
 * that needs more input before it can be saved.
 */
export const QUESTION_KINDS: QuestionKindOption[] = [
  { value: "text", label: "Text", hint: "A free-text answer." },
  {
    value: "bool",
    label: "Yes / no",
    hint: "A tick-box. Make it required for a code of conduct.",
  },
  {
    value: "enum",
    label: "Choose one",
    hint: "One answer from a fixed list of options.",
  },
]

export function questionKindLabel(kind: QuestionKind): string {
  return QUESTION_KINDS.find((k) => k.value === kind)?.label ?? kind
}

/** Whether this kind needs an options list before it can be saved. */
export function kindNeedsOptions(kind: QuestionKind): boolean {
  return kind === "enum"
}

/**
 * The form field carrying an answer to one question.
 *
 * Here rather than beside the parser because both halves need it: the page
 * renders the name and the server-only parser reads it, and a convention spelled
 * in two places is one that drifts.
 */
export function answerFieldName(questionId: string): string {
  return `answer:${questionId}`
}
