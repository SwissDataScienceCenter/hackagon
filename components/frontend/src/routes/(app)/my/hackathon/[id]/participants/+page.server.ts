import type { PageServerLoad } from "./$types"
import { membershipBadgeLabel } from "$lib/utils/hackathonRole"

// No owner/admin check here: the way into participant management is the
// sidebar's Manage section, which gates itself on the same subjects (see
// $lib/navigation's manageNav) and owns the Approve/Remove actions. This page is
// the participant view and reads the same for everyone — an organizer included,
// which is what lets them see exactly what a participant sees.
export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already returns every
  // participant with their casbin role and waitlist flag.
  const { hackathon } = await event.parent()

  // Waitlisted members are dropped: who has applied and not been accepted is
  // between the applicant and the organizer, and the "Waitlisted" chip
  // otherwise told every participant which of their peers was still pending.
  // They are not hidden from the people who act on them — Manage Participants
  // lists them, with Approve, and the Manage hub badges how many are waiting.
  //
  // Filtered in the load rather than the component, so this page's payload never
  // carries the waitlisted names at all.
  const participants = hackathon.members
    .filter((m) => m.user !== undefined && !m.isWaiting)
    .map((m) => ({
      id: m.user!.id,
      name: m.user!.displayName || m.user!.username,
      roleLabel: membershipBadgeLabel(m.isWaiting, m.role),
    }))

  return { participants }
}
