import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"

/**
 * No backend call: the layout's single `GetHackathon` already carries the
 * projects, and only the approved ones — the backend filters on status, so a
 * proposal nobody accepted was never in the response.
 *
 * Tracks come from the same payload and are turned into a lookup here rather
 * than in the component, so the markup renders a name it was handed instead of
 * searching an array per row.
 */
export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()

  // The tab that leads here is not drawn when there is nothing on it, so
  // arriving anyway means a typed or stale URL.
  if (hackathon.projects.length === 0) error(404, "Not found")

  const trackNames = new Map(hackathon.tracks.map((t) => [t.id, t.name]))

  return {
    projects: hackathon.projects.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      image: p.image,
      trackName: trackNames.get(p.trackId),
    })),
  }
}
