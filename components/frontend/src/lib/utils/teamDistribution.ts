/**
 * Suggests how to split a hackathon's participants into teams, from the
 * projects they said they were interested in.
 *
 * Kept out of the page component so it can be tested directly: the interesting
 * behaviour is the distribution, not the drag-and-drop around it.
 */

export type DistributablePerson = {
  id: string
  /** Ids of the projects this person marked as preferred. */
  preferredProjectIds: string[]
}

export type DistributableProject = {
  id: string
  title: string
  /** Teams that already exist for this project, with their current members. */
  teams: { id: string; name: string; memberIds: string[] }[]
}

export type PlannedTeam = {
  /** Stable key for rendering; equals `id` for a team that already exists. */
  key: string
  /** `null` for a team the plan invented and that still has to be created. */
  id: string | null
  projectId: string
  name: string
  memberIds: string[]
}

export type DistributionOptions = {
  /** Above this a team stops being one. The only size rule there is. */
  max: number
}

/**
 * Builds a distribution from what people asked for. One rule:
 *
 *   everyone goes to a project they picked, spread evenly, no team over `max`.
 *
 * There is deliberately **no minimum**. A minimum sounds reasonable and is the
 * source of every hard case: projects have to be dissolved, the people on them
 * redistributed, some totals cannot satisfy both bounds at once, and raising it
 * can leave a team with nobody in it. Without one, a project two people want is
 * simply a team of two — which an organizer can look at and fix by dragging, a
 * judgement no arithmetic was going to make correctly anyway.
 *
 * Preferences are an **unranked set** — the schema has no first or second
 * choice — so "according to their preferences" can only mean "on a project they
 * picked". Given that, this spreads people across their options rather than
 * piling everyone onto the popular ones, which is also what keeps team sizes
 * even.
 *
 * Teams that already exist are kept and their members left where they are
 * wherever the sizes allow.
 *
 * Deterministic: the same input always yields the same plan, so pressing the
 * button twice cannot quietly produce two different answers.
 */
export function suggestDistribution(
  projects: DistributableProject[],
  unassigned: DistributablePerson[],
  { max }: DistributionOptions,
): PlannedTeam[] {
  const existingTeams: PlannedTeam[] = projects.flatMap((p) =>
    p.teams.map((t) => ({
      key: t.id,
      id: t.id,
      projectId: p.id,
      name: t.name,
      memberIds: [...t.memberIds],
    })),
  )

  const byId = new Map(projects.map((p) => [p.id, p]))

  // Headcount per project, starting from whoever is already on a team there so
  // a half-staffed project is not filled twice over.
  const load: Record<string, number> = {}
  for (const t of existingTeams) {
    load[t.projectId] = (load[t.projectId] ?? 0) + t.memberIds.length
  }

  // Only a project that is actually on offer can take anyone.
  const optionsFor = (person: DistributablePerson) =>
    person.preferredProjectIds.filter((id) => byId.has(id))

  const emptiest = (ids: string[]) =>
    ids.reduce((a, b) => ((load[a] ?? 0) <= (load[b] ?? 0) ? a : b))

  // Fewest options first — whoever is hardest to place gets the pick of the
  // room. Ties break on id, which is what makes the result reproducible.
  const pool = [...unassigned].sort(
    (a, b) =>
      optionsFor(a).length - optionsFor(b).length || a.id.localeCompare(b.id),
  )

  const chosen: Record<string, string> = {}
  for (const person of pool) {
    const options = optionsFor(person)
    if (options.length === 0) continue
    const best = emptiest(options)
    chosen[person.id] = best
    load[best] = (load[best] ?? 0) + 1
  }

  const byProject: Record<string, string[]> = {}
  for (const [userId, projectId] of Object.entries(chosen)) {
    ;(byProject[projectId] ??= []).push(userId)
  }

  const result: PlannedTeam[] = []
  let invented = 0

  for (const p of projects) {
    const existing = existingTeams.filter((t) => t.projectId === p.id)
    const incoming = [...(byProject[p.id] ?? [])].sort()

    // Nobody new: leave the project exactly as it stands. Re-cutting teams
    // nothing has changed about would move people for no reason.
    if (incoming.length === 0) {
      result.push(...existing)
      continue
    }

    const held = existing.reduce((n, t) => n + t.memberIds.length, 0)
    const total = held + incoming.length

    // Enough teams to keep every one of them at or under `max`, and never fewer
    // than already exist — emptying a team the organizer built is not this
    // function's call to make.
    const count = Math.max(existing.length, Math.ceil(total / max))
    const targets = balancedSizes(total, count)

    // Existing members keep their own team where it still has room for them, so
    // the plan moves as few of them as it can; whoever spills over — and
    // everyone new — is placed below.
    const floating: string[] = []
    const planned: PlannedTeam[] = []

    for (let i = 0; i < count; i++) {
      const was = existing[i]
      if (was === undefined) {
        const base = `Team ${initialsOf(p.title)}`
        planned.push({
          key: `new-${invented++}`,
          id: null,
          projectId: p.id,
          name: i === 0 ? base : `${base} ${i + 1}`,
          memberIds: [],
        })
        continue
      }
      const target = targets[i] ?? 0
      floating.push(...was.memberIds.slice(target))
      planned.push({ ...was, memberIds: was.memberIds.slice(0, target) })
    }

    floating.push(...incoming)
    for (let i = 0; i < count; i++) {
      const team = planned[i]
      if (team === undefined) continue
      const room = (targets[i] ?? 0) - team.memberIds.length
      if (room > 0) team.memberIds.push(...floating.splice(0, room))
    }
    // Belt and braces: the targets sum to `total`, so nothing should be left.
    for (let i = 0; floating.length > 0; i++) {
      planned[i % count]?.memberIds.push(...floating.splice(0, 1))
    }

    result.push(...planned)
  }

  return result
}

/** Splits `total` into `count` parts differing by at most one, largest first. */
function balancedSizes(total: number, count: number): number[] {
  const base = Math.floor(total / count)
  const over = total % count

  return Array.from({ length: count }, (_, i) => base + (i < over ? 1 : 0))
}

/** "AutoML Pipeline Builder" -> "APB". Mirrors the server's team naming. */
export function initialsOf(text: string): string {
  return (
    text
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  )
}
