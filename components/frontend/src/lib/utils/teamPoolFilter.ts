import type { QuestionKind } from "./question"

/**
 * Narrowing the team-assignment pool by what people answered at registration.
 *
 * Kept out of the page so it can be tested directly: the page only renders
 * what this decides.
 *
 * **One rule for combining:** answers to one question widen (B1 or B2),
 * different questions narrow (B2 and "python"). That is what "people who said
 * Beginner or Intermediate, and who are remote" means when said aloud.
 *
 * A filter reorders rather than hides — see `matchesFirst`.
 */

export type PoolFilters = {
  /** Picked answers, by question id. A question with none picked is absent. */
  answers: Record<string, string[]>
  /** "Contains" text for free-text questions, by question id. Never blank. */
  texts: Record<string, string>
  /**
   * Picked projects, by id: people who prefer any of them match. Treated as
   * one more question — "which projects do you want" — so it widens within
   * itself and narrows against the answers.
   */
  projects: string[]
}

export const NO_FILTERS: PoolFilters = { answers: {}, texts: {}, projects: [] }

/** A question as far as filtering needs it. */
export interface FilterQuestion {
  id: string
  kind: QuestionKind
  options: readonly { label: string }[]
}

/** A person as far as filtering needs it. */
export interface FilterablePerson {
  /** Their answers, by question id. */
  codes: Record<string, { label: string }>
  /** The projects they said they want. */
  preferredProjectIds: readonly string[]
}

/**
 * Filters as read back from storage, keeping only what still means something.
 *
 * Keyed by question id and answer text rather than by code, so a letter that
 * shifts when a question is added cannot point a saved filter at a different
 * question. Anything naming a question, an answer or a project that no longer
 * exists is dropped, and anything that is not ours at all reads as no filter.
 */
export function restoreFilters(
  stored: unknown,
  questions: readonly FilterQuestion[],
  projectIds: readonly string[],
): PoolFilters {
  const byId = new Map(questions.map((q) => [q.id, q]))
  const record = (v: unknown): Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {}
  const s = record(stored)

  const answers: PoolFilters["answers"] = {}
  for (const [id, labels] of Object.entries(record(s.answers))) {
    const q = byId.get(id)
    if (!q || q.kind === "text" || !Array.isArray(labels)) continue
    const known = labels.filter(
      (l): l is string =>
        typeof l === "string" && q.options.some((o) => o.label === l),
    )
    if (known.length > 0) answers[id] = [...new Set(known)]
  }

  const texts: PoolFilters["texts"] = {}
  for (const [id, text] of Object.entries(record(s.texts))) {
    if (
      byId.get(id)?.kind === "text" &&
      typeof text === "string" &&
      text.trim() !== ""
    ) {
      texts[id] = text
    }
  }

  const known = new Set(projectIds)
  const projects = Array.isArray(s.projects)
    ? [
        ...new Set(
          s.projects.filter(
            (id): id is string => typeof id === "string" && known.has(id),
          ),
        ),
      ]
    : []

  return { answers, texts, projects }
}

/** Picks a project if it is not picked, and unpicks it if it is. */
export function toggleProject(
  filters: PoolFilters,
  projectId: string,
): PoolFilters {
  return {
    ...filters,
    projects: filters.projects.includes(projectId)
      ? filters.projects.filter((id) => id !== projectId)
      : [...filters.projects, projectId],
  }
}

/** Picks an answer if it is not picked, and unpicks it if it is. */
export function toggleAnswer(
  filters: PoolFilters,
  questionId: string,
  label: string,
): PoolFilters {
  const picked = filters.answers[questionId] ?? []
  const next = picked.includes(label)
    ? picked.filter((l) => l !== label)
    : [...picked, label]
  const answers = { ...filters.answers, [questionId]: next }
  if (next.length === 0) delete answers[questionId]

  return { ...filters, answers }
}

/** Sets a free-text question's "contains" text; blank removes it. */
export function setText(
  filters: PoolFilters,
  questionId: string,
  text: string,
): PoolFilters {
  const texts = { ...filters.texts, [questionId]: text }
  if (text.trim() === "") delete texts[questionId]

  return { ...filters, texts }
}

export function isFiltering(filters: PoolFilters): boolean {
  return (
    Object.keys(filters.answers).length > 0 ||
    Object.keys(filters.texts).length > 0 ||
    filters.projects.length > 0
  )
}

/**
 * Whether a person passes every filter. Free text matches ignoring case and
 * the spaces around what was typed.
 */
export function matches(
  person: FilterablePerson,
  filters: PoolFilters,
): boolean {
  if (
    filters.projects.length > 0 &&
    !filters.projects.some((id) => person.preferredProjectIds.includes(id))
  ) {
    return false
  }
  for (const [id, labels] of Object.entries(filters.answers)) {
    const answer = person.codes[id]
    if (!answer || !labels.includes(answer.label)) return false
  }
  for (const [id, text] of Object.entries(filters.texts)) {
    const needle = text.trim().toLowerCase()
    if (!person.codes[id]?.label.toLowerCase().includes(needle)) return false
  }

  return true
}

/**
 * The pool split into who matches and who does not, each in its original
 * order.
 *
 * Reordering rather than hiding is deliberate. A hidden person is one that
 * dragging back into the pool appears to lose, and a filter left on from
 * yesterday reads as people having vanished. Everyone stays in reach; the
 * filter only decides who is on top.
 */
export function matchesFirst<T extends FilterablePerson>(
  people: readonly T[],
  filters: PoolFilters,
): { matching: T[]; rest: T[] } {
  const matching: T[] = []
  const rest: T[] = []
  for (const p of people) (matches(p, filters) ? matching : rest).push(p)

  return { matching, rest }
}

/** How many people picked each project, by project id. */
export function countPreferences(
  people: readonly FilterablePerson[],
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const p of people) {
    for (const id of new Set(p.preferredProjectIds)) {
      counts[id] = (counts[id] ?? 0) + 1
    }
  }

  return counts
}

/** How many people gave each answer, by question id then answer text. */
export function countAnswers(
  people: readonly FilterablePerson[],
): Record<string, Record<string, number>> {
  const counts: Record<string, Record<string, number>> = {}
  for (const p of people) {
    for (const [id, answer] of Object.entries(p.codes)) {
      const byAnswer = (counts[id] ??= {})
      byAnswer[answer.label] = (byAnswer[answer.label] ?? 0) + 1
    }
  }

  return counts
}
