import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"

/**
 * No backend call: the layout's single `GetHackathon` already carries the teams.
 *
 * What it carries is a member *count*, never a roster — the backend publishes no
 * names, because the people on these teams registered without being told their
 * name would appear on a public web page. There is nothing to filter here; there
 * is simply no name to render.
 */
export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()

  // The tab that leads here is not drawn when there is nothing on it, so
  // arriving anyway means a typed or stale URL.
  if (hackathon.teams.length === 0) error(404, "Not found")

  const projectTitles = new Map(hackathon.projects.map((p) => [p.id, p.title]))

  return {
    teams: hackathon.teams.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      memberCount: t.memberCount,
      projectTitle: projectTitles.get(t.projectId),
      // Final submissions only — the backend withholds drafts, which are work a
      // team has not chosen to show anyone.
      submissions: t.submissions.map((s) => ({ id: s.id, result: s.result })),
    })),
  }
}
