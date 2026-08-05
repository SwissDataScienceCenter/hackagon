import type { HackathonMember } from "$lib/server/grpc/generated/hackathon/entities/hackathon_member"
import { HackathonRole } from "$lib/server/grpc/generated/hackathon/entities/hackathon_role"

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

/**
 * Whether to offer phase management — create, edit, delete.
 *
 * Unlike `mayPreferProjects`, this mirrors the backend **exactly**, and can:
 * `PhaseService.Create`/`Edit`/`Delete` all enforce hackathon-scoped
 * `phase:write` (`phase_service.go:139`, `:253`, `:385`), which casbin grants to
 * `Owner` outright (`rbac.go:182`) and to an admin through the global escape
 * hatch. No capability gates it, so there is no state in which this returns true
 * and the RPC then refuses — which is why there is no TODO here and no
 * shown-then-refused control.
 *
 * `Member` holds `phase:read` only (`rbac.go:202`), so participants see the
 * timeline and none of the controls.
 */
export function mayManagePhases(
  membership: HackathonMember | undefined,
  isAdmin = false,
): boolean {
  if (isAdmin) return true

  return membership?.role === HackathonRole.HACKATHON_ROLE_OWNER
}

/**
 * Whether to offer page management — create, edit, delete.
 *
 * Mirrors the backend exactly, same as `mayManagePhases`: `PageService.Create`/
 * `Edit`/`Delete` all enforce hackathon-scoped `page:write` (`page_service.go:150`,
 * `:257`, `:334`), which casbin grants to `Owner` outright and to an admin through
 * the global escape hatch (`rbac.go:178`). `Member` holds `page:read` only
 * (`rbac.go:200`), so participants see published pages and none of the controls.
 */
export function mayManagePages(
  membership: HackathonMember | undefined,
  isAdmin = false,
): boolean {
  if (isAdmin) return true

  return membership?.role === HackathonRole.HACKATHON_ROLE_OWNER
}

/**
 * Whether to offer track management — create, edit, delete.
 *
 * Mirrors the backend exactly, same as `mayManagePhases`/`mayManagePages`:
 * `TrackService.Create`/`Edit`/`Delete` all enforce hackathon-scoped
 * `track:write` (`rbac.go:186`), which casbin grants to `Owner` outright and to
 * an admin through the global escape hatch. `Member` holds `track:read` only
 * (`rbac.go:204`), so participants see tracks wherever they're offered (the
 * project picker, the overview) and none of the controls. No capability gates
 * it, so there is no shown-then-refused control.
 */
export function mayManageTracks(
  membership: HackathonMember | undefined,
  isAdmin = false,
): boolean {
  if (isAdmin) return true

  return membership?.role === HackathonRole.HACKATHON_ROLE_OWNER
}

/**
 * Whether to offer participant management — approve a waitlisted participant,
 * remove one.
 *
 * Mirrors the backend exactly, same as `mayManagePhases`/`mayManagePages`:
 * `HackathonService.ApproveParticipant`/`RemoveParticipant` both enforce
 * hackathon-scoped `hackathon:write` (`hackathon_service.go:303`, `:389`), which
 * casbin grants to `Owner` outright and to an admin through the global escape
 * hatch (`rbac.go:176`). `Member` holds only `hackathon:read` (`rbac.go:198`), so
 * participants see the list and none of the controls. No capability gates
 * either RPC, so there is no shown-then-refused state to guard against.
 */
export function mayManageParticipants(
  membership: HackathonMember | undefined,
  isAdmin = false,
): boolean {
  if (isAdmin) return true

  return membership?.role === HackathonRole.HACKATHON_ROLE_OWNER
}
