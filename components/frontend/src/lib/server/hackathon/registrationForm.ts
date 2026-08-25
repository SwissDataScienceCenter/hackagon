import type { Answer } from "$lib/server/grpc/generated/hackathon/entities/answer"
import {
  QuestionType,
  type Question,
} from "$lib/server/grpc/generated/hackathon/entities/question"
import { answerFieldName, type QuestionKind } from "$lib/utils/question"

/**
 * Server-only: reads the generated `QuestionType` enum, so it must never be
 * imported by a component. The client-safe half — the kinds and their labels —
 * is in `$lib/utils/question`.
 */

/** Longest key `CreateQuestionRequest` accepts (`string.max_len = 64`). */
const KEY_MAX = 64
/** Longest label `CreateQuestionRequest` accepts (`string.max_len = 255`). */
const LABEL_MAX = 255

/**
 * The key pattern the backend enforces twice — `buf.validate` on the request and
 * `Match()` on the column — so a key that fails here would fail there too. Kept
 * strict for the reason the column is: a key is what an export uses as a heading.
 */
const KEY_PATTERN = /^[a-z][a-z0-9_]*$/

export function questionKind(type: QuestionType): QuestionKind {
  switch (type) {
    case QuestionType.QUESTION_TYPE_BOOL:
      return "bool"
    case QuestionType.QUESTION_TYPE_ENUM:
      return "enum"
    default:
      // Text is the fallback rather than an error: an UNSPECIFIED or
      // UNRECOGNIZED type is a question we cannot render as anything else, and a
      // text box at least shows the organizer what they wrote.
      return "text"
  }
}

export function questionType(kind: QuestionKind): QuestionType {
  switch (kind) {
    case "bool":
      return QuestionType.QUESTION_TYPE_BOOL
    case "enum":
      return QuestionType.QUESTION_TYPE_ENUM
    default:
      return QuestionType.QUESTION_TYPE_TEXT
  }
}

/** One question as the builder renders it — no generated types in sight. */
export interface QuestionRow {
  id: string
  key: string
  label: string
  kind: QuestionKind
  mandatory: boolean
  order: number
  options: string[]
  /**
   * How many people have answered this question.
   *
   * Drives the locking in the builder: the backend refuses a type change or a
   * promotion to mandatory once any answer exists (`FAILED_PRECONDITION`), so
   * offering those controls would be offering a refusal. It stays the authority
   * — this only decides what to put on screen.
   */
  answerCount: number
}

/**
 * Merge the questions with a count of the answers filed against each.
 *
 * `answers` comes from `ListParticipantAnswers`, which returns the whole cohort
 * to a caller holding hackathon write and silently narrows to the caller's own
 * answers otherwise. That degradation is invisible on the wire, so a zero here
 * means "nobody answered, as far as this caller can see" — safe for locking,
 * which errs towards leaving a control enabled and letting the backend refuse.
 */
export function questionRows(
  questions: readonly Question[],
  answers: readonly Answer[] = [],
): QuestionRow[] {
  const counts = new Map<string, number>()
  for (const a of answers) {
    counts.set(a.questionId, (counts.get(a.questionId) ?? 0) + 1)
  }

  return [...questions]
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
    .map((q) => ({
      id: q.id,
      key: q.key,
      label: q.label,
      kind: questionKind(q.type),
      mandatory: q.mandatory,
      order: q.order,
      options: q.options,
      answerCount: counts.get(q.id) ?? 0,
    }))
}

/** A parsed, validated question form, in the shape the RPCs want. */
export interface QuestionFormValues {
  key: string
  label: string
  type: QuestionType
  mandatory: boolean
  order: number
  options: string[]
}

export type QuestionFormResult =
  | { ok: true; values: QuestionFormValues }
  | { ok: false; message: string }

/**
 * Options as typed into the textarea: one per line.
 *
 * A line-per-option rather than comma-separated because an option may legitimately
 * contain a comma ("Zurich, Switzerland") and nothing in the schema forbids it.
 * Blank lines are dropped rather than rejected — they are how someone spaces a
 * list out while typing it.
 */
function parseOptions(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return []

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
}

/**
 * Validate a question create/edit submission.
 *
 * Every rule here is one the backend also enforces, so this buys a legible
 * message instead of a raw `InvalidArgument`; the RPC stays the authority and the
 * actions surface its `details` when it disagrees. The one exception is the
 * options check, which the backend applies to *answers* rather than to the
 * schema — it will happily store an enum question with no options, and the
 * result is a dropdown nobody can answer.
 *
 * `key` is returned even for an edit, where `EditQuestionRequest` has no such
 * field. The caller drops it; validating it regardless keeps one parser for both
 * forms rather than two that can drift.
 */
export function parseQuestionForm(form: FormData): QuestionFormResult {
  const rawKey = form.get("key")
  const rawLabel = form.get("label")
  const rawKind = form.get("kind")
  const rawOrder = form.get("order")

  const key = typeof rawKey === "string" ? rawKey.trim() : ""
  if (key === "") {
    return { ok: false, message: "A key is required" }
  }
  if (key.length > KEY_MAX) {
    return { ok: false, message: `Key must be at most ${KEY_MAX} characters` }
  }
  if (!KEY_PATTERN.test(key)) {
    return {
      ok: false,
      message:
        "Key must start with a letter and use only lowercase letters, " +
        "digits and underscores",
    }
  }

  const label = typeof rawLabel === "string" ? rawLabel.trim() : ""
  if (label === "") {
    return { ok: false, message: "A question is required" }
  }
  if (label.length > LABEL_MAX) {
    return {
      ok: false,
      message: `Question must be at most ${LABEL_MAX} characters`,
    }
  }

  const kind = typeof rawKind === "string" ? rawKind : ""
  if (kind !== "text" && kind !== "bool" && kind !== "enum") {
    return { ok: false, message: "Choose an answer type" }
  }

  // Only meaningful for a fixed list; carried as empty otherwise so a question
  // switched away from `enum` does not keep options nothing reads.
  const options = kind === "enum" ? parseOptions(form.get("options")) : []
  if (kind === "enum") {
    if (options.length < 2) {
      return {
        ok: false,
        message: "A fixed list needs at least two options, one per line",
      }
    }
    if (new Set(options).size !== options.length) {
      // An answer stores the option's text, so two identical options are two
      // answers nobody can tell apart afterwards.
      return { ok: false, message: "Options must be different from each other" }
    }
  }

  // Absent means "put it last", which is what the builder's blank new-row field
  // submits. Order is a plain number for now: there is no reorder RPC, so moving
  // a question means editing this field.
  let order = 0
  if (typeof rawOrder === "string" && rawOrder.trim() !== "") {
    order = Number(rawOrder)
    if (!Number.isInteger(order) || order < 0) {
      return {
        ok: false,
        message: "Position must be a whole number, 0 or more",
      }
    }
  }

  return {
    ok: true,
    values: {
      key,
      label,
      type: questionType(kind),
      // An unticked box submits nothing at all, so absence is false.
      mandatory: form.get("mandatory") === "true",
      order,
      options,
    },
  }
}

/**
 * One answer in the shape `SubmitAnswers` and `Join` both take.
 *
 * `participantId` is required by the generated type but ignored by the server,
 * which derives the answerer from the bearer token — so it goes out empty rather
 * than letting a client name whose answer this is.
 */
export interface AnswerInput {
  questionId: string
  participantId: string
  textValue?: string
  boolValue?: boolean
}

/**
 * Read a filled-in registration form.
 *
 * Driven by `questions` rather than by the form's own keys: the answer's arm of
 * the `value` oneof is a fact about the question, and the backend refuses a text
 * answer to a bool question. Anything the form carries for a question that no
 * longer exists is dropped rather than sent, since the backend would refuse the
 * whole submission over it.
 *
 * **A blank answer is omitted, not sent empty.** Two reasons. The backend checks
 * that a mandatory question has *an answer*, not that the answer says anything,
 * so sending `""` would let a required question through blank and make
 * `mandatory` meaningless. And an unticked mandatory tick-box is a refusal, not
 * an answer — omitting it is what makes the backend report "missing mandatory
 * answers" instead of silently recording a "no" to the code of conduct.
 *
 * The cost is that a once-answered optional question cannot be blanked again:
 * answers are upserted and nothing deletes them, so an omitted field leaves the
 * previous value in place. That is a backend limitation, not a choice here, and
 * papering over it would mean writing `""` and reintroducing the hole above.
 */
export function parseAnswers(
  form: FormData,
  questions: readonly QuestionRow[],
): AnswerInput[] {
  const answers: AnswerInput[] = []

  for (const q of questions) {
    const raw = form.get(answerFieldName(q.id))

    if (q.kind === "bool") {
      const ticked = raw === "true"
      // A required box left unticked is withheld so the backend refuses it. An
      // optional one sends `false`, which is a real answer and not an absence.
      if (q.mandatory && !ticked) continue
      answers.push({ questionId: q.id, participantId: "", boolValue: ticked })
      continue
    }

    const text = typeof raw === "string" ? raw.trim() : ""
    if (text === "") continue
    answers.push({ questionId: q.id, participantId: "", textValue: text })
  }

  return answers
}

/**
 * The answers already on file, keyed by question id, for prefilling the form.
 *
 * A bool arrives as `boolValue` now that the backend reads the arm from the
 * question's type; a text or enum answer as `textValue`. Anything else is left
 * out so an unanswered question renders empty rather than as the string "false".
 */
export function answerValues(
  answers: readonly Answer[],
): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {}
  for (const a of answers) {
    if (a.boolValue !== undefined) values[a.questionId] = a.boolValue
    else if (a.textValue !== undefined) values[a.questionId] = a.textValue
  }

  return values
}

/**
 * The keys of the mandatory questions this submission leaves unanswered.
 *
 * A courtesy check so the page can name them before a round trip; the backend
 * repeats it and stays the authority.
 */
export function missingMandatory(
  questions: readonly QuestionRow[],
  answers: readonly AnswerInput[],
): string[] {
  const answered = new Set(answers.map((a) => a.questionId))

  return questions
    .filter((q) => q.mandatory && !answered.has(q.id))
    .map((q) => q.key)
}

/** One question and what a given participant answered to it. */
export interface ParticipantAnswer {
  questionId: string
  key: string
  label: string
  /** A bool arrives as a bool; text and enum as strings. */
  value: string | boolean
}

/**
 * The cohort's answers, grouped by the participant who gave them and ordered by
 * the question order so every row reads down the form the same way.
 *
 * Only questions the person actually answered appear, which is what
 * `ListParticipantAnswers` returns: a participant with no entry answered
 * nothing, and that is a different fact from answering and leaving the optional
 * parts blank.
 *
 * Note that answers outlive `RemoveParticipant` — it deletes the participant row
 * and nothing deletes the answers — so this can hold ids that are no longer on
 * the roster. Callers should read it through the roster rather than counting it
 * directly, or a "12 of 10 answered" becomes possible.
 */
export function answersByParticipant(
  questions: readonly QuestionRow[],
  answers: readonly Answer[],
): Record<string, ParticipantAnswer[]> {
  const byId = new Map(questions.map((q) => [q.id, q]))
  const order = new Map(questions.map((q, i) => [q.id, i]))
  const grouped: Record<string, ParticipantAnswer[]> = {}

  for (const a of answers) {
    const q = byId.get(a.questionId)
    // A question deleted since the answer was filed. Dropped rather than shown
    // as an unlabelled value, which would say nothing an organizer can use.
    if (!q) continue

    const value = a.boolValue !== undefined ? a.boolValue : a.textValue
    if (value === undefined) continue

    const list = grouped[a.participantId] ?? (grouped[a.participantId] = [])
    list.push({ questionId: q.id, key: q.key, label: q.label, value })
  }

  for (const list of Object.values(grouped)) {
    list.sort(
      (x, y) => (order.get(x.questionId) ?? 0) - (order.get(y.questionId) ?? 0),
    )
  }

  return grouped
}
