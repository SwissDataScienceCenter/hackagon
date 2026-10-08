import type { QuestionKind } from "./question"

/**
 * Short names an organizer gives registration questions on the team-assignment
 * page, so a card can say `size: S` or `remote` instead of `B: S` or `D: Yes`.
 *
 * A view preference of one organizer at one screen, kept in their browser like
 * the "Show on cards" ticks: a co-organizer sees letters until they name the
 * questions themselves, and the spreadsheet download keeps the full questions.
 *
 * Purely presentation. Filters are kept against the answer as stored, so
 * renaming a question or its Yes and No never changes what a filter matches.
 */

/** What an organizer has named one question. Anything unset is absent. */
export type QuestionLabels = {
  /**
   * Stands in for the question's letter. Never set on a tick-box: its own
   * words for Yes and No say which question they answer, so a short name
   * would be a third box for the same thing.
   */
  short?: string
  /** Shown instead of a tick-box's Yes. */
  yes?: string
  /** Shown instead of a tick-box's No. */
  no?: string
}

/** By question id. A question with nothing named is absent. */
export type AnswerLabels = Record<string, QuestionLabels>

/** Long enough for "experience", short enough to leave a card readable. */
export const LABEL_MAX = 12

/** A question as far as naming it needs. */
export interface LabeledQuestion {
  id: string
  letter: string
  kind: QuestionKind
}

/** Trimmed and capped; blank reads as unset. */
function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const text = value.trim().slice(0, LABEL_MAX).trim()

  return text === "" ? undefined : text
}

/**
 * One question's names, tidied: trimmed, capped, blanks dropped. A tick-box
 * keeps only its Yes and No words, every other kind only its short name.
 */
function tidy(raw: unknown, kind: QuestionKind): QuestionLabels {
  const r =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {}
  const out: QuestionLabels = {}
  if (kind === "bool") {
    const yes = clean(r.yes)
    const no = clean(r.no)
    if (yes) out.yes = yes
    if (no) out.no = no
  } else {
    const short = clean(r.short)
    if (short) out.short = short
  }

  return out
}

/**
 * Names as read back from storage, keeping only those for questions that still
 * exist. Anything that is not ours reads as nothing named.
 */
export function restoreLabels(
  stored: unknown,
  questions: readonly LabeledQuestion[],
): AnswerLabels {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) {
    return {}
  }
  const raw = stored as Record<string, unknown>
  const out: AnswerLabels = {}
  for (const q of questions) {
    const named = tidy(raw[q.id], q.kind)
    if (Object.keys(named).length > 0) out[q.id] = named
  }

  return out
}

/** Replaces one question's names; all blank clears them. */
export function setLabels(
  labels: AnswerLabels,
  question: LabeledQuestion,
  next: QuestionLabels,
): AnswerLabels {
  const named = tidy(next, question.kind)
  const out = { ...labels, [question.id]: named }
  if (Object.keys(named).length === 0) delete out[question.id]

  return out
}

/** The question's short name, or its letter until it has one. */
export function shortName(
  question: LabeledQuestion,
  labels: AnswerLabels,
): string {
  return labels[question.id]?.short ?? question.letter
}

/**
 * An answer as an answer pill reads it: the answer itself, or a tick-box's own
 * word for it once one is set.
 */
export function optionText(
  question: LabeledQuestion,
  answer: string,
  labels: AnswerLabels,
): string {
  if (question.kind !== "bool") return answer
  const named = labels[question.id]
  const word =
    answer === "Yes" ? named?.yes : answer === "No" ? named?.no : undefined

  return word ?? answer
}

/**
 * An answer as a card or a filter tag reads it.
 *
 * `size: S` — the short name (or letter) and the answer. A tick-box with its
 * own word for that answer shows the word alone — `remote` already says which
 * question — and falls back to its letter, `D: No`, for a side without one.
 */
export function answerText(
  question: LabeledQuestion,
  answer: string,
  labels: AnswerLabels,
): string {
  const word = optionText(question, answer, labels)
  if (question.kind === "bool" && word !== answer) return word

  return `${shortName(question, labels)}: ${answer}`
}
