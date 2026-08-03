import type { PageServerLoad } from "./$types"
import { ProjectStatus } from "$lib/server/grpc/generated/hackathon/entities/project_status"
import {
  projectStatusBadgePreset,
  projectStatusLabel,
} from "$lib/utils/projectStatus"

interface ProposalCardData {
  num: number
  id: string
  title: string
  description: string
  imageUrl?: string
  badge?: string
  badgePreset?: string
  track?: string
}

export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()
  const platformUserId = event.locals.platformUser?.id

  // Project.track_id is a bare UUID and there is no member-facing Tracks page
  // any more, so the card itself has to carry the name.
  const trackNames = new Map(hackathon.tracks.map((t) => [t.id, t.name]))
  const trackOf = (trackId: string | undefined) =>
    trackId ? trackNames.get(trackId) : undefined

  // Browse tab: only approved projects are real work to join. Pending proposals
  // stay their author's business until an owner approves them.
  const approved: ProposalCardData[] = hackathon.projects
    .filter((p) => p.status === ProjectStatus.PROJECT_STATUS_APPROVED)
    .map((p, i) => ({
      num: i + 1,
      id: p.id,
      title: p.title,
      description: p.description,
      imageUrl: p.image,
      track: trackOf(p.trackId),
    }))

  // Own tab keeps every status — seeing whether a proposal is still pending is
  // the whole reason this tab exists, so it carries a status badge.
  const mine: ProposalCardData[] = hackathon.projects
    .filter((p) => p.creatorId === platformUserId)
    .map((p, i) => ({
      num: i + 1,
      id: p.id,
      title: p.title,
      description: p.description,
      imageUrl: p.image,
      badge: projectStatusLabel(p.status) ?? "Unknown",
      badgePreset: projectStatusBadgePreset(p.status) ?? "preset-tonal-surface",
      track: trackOf(p.trackId),
    }))

  return { approved, mine, slug: event.params.slug }
}
