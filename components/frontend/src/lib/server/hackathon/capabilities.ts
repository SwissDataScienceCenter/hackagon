import type { HackathonMember } from "$lib/server/grpc/generated/hackathon/entities/hackathon_member"

/**
 * Server-only: reads generated types, so it must never be imported by a
 * component. These are courtesy checks that decide whether to *offer* an
 * action — the backend's casbin `Enforce` remains the authority, and every
 * caller translates the gRPC error it may get anyway.
 */

/**
 * Whether to show a "mark as preferred" control.
 *
 * Offered to anyone confirmed in the hackathon — member or owner. An owner who
 * wants to work on a project has the same reason to express a preference as
 * anyone else, and being the organiser is not a reason to be shut out of it.
 *
 * Waitlisted users are excluded, which is the one condition
 * `ProjectService.SetPreference` checks that is both stable and knowable here
 * (`project_service.go:365`). The handler also requires the caller be a
 * participant at all, which a present `membership` implies.
 *
 * TODO(backend: project-preferences-capability): two conditions the handler
 * enforces are deliberately *not* mirrored, because mirroring them hides the
 * control everywhere instead of some of the time:
 *
 *  - the `SET_TEAM_PREFERENCES` capability, which is what writes the casbin
 *    `project:join` row (`hackathon_service.go:632`). Nothing in the app enables
 *    it, and seeded hackathons have no HackathonState row to enable it on.
 *  - the Member role, which is the only role that capability grants
 *    `project:join` to. The casbin model has no inheritance, so an owner is
 *    refused however the capability is set.
 *
 * Until both are addressed the control is shown and the backend's
 * PermissionDenied is surfaced as-is. Restore the checks once an owner can
 * actually be granted the permission, so the control is hidden when preferences
 * are deliberately off rather than shown and refused.
 */
export function mayPreferProjects(
  membership: HackathonMember | undefined,
  isAdmin = false,
): boolean {
  if (isAdmin) return true

  return membership !== undefined && !membership.isWaiting
}
