// Invitation links, as the organiser's page needs them.
//
// `ListInvites` hands back every invite of a hackathon — live, revoked and
// expired mixed together, in no particular order, and with no field saying which
// is which. All three facts are worth knowing before reading anything below:
//
//   - **No status field.** An invite carries `revoked_at` and `expires_at` and
//     nothing else, so the state is derived here rather than read.
//   - **No ordering.** The handler runs a bare `Query().All()`
//     (`hackathon_service.go:295`), so the order is whatever Postgres returns.
//     A list that reshuffles between two visits is what makes an organiser
//     doubt they revoked the right row, hence the sort below.
//   - **No filter.** There is no `include_revoked` on the request, so a page
//     that only wants live links has to drop the rest itself.

import type { HackathonInvite } from "$lib/server/grpc/generated/hackathon/entities/hackathon_invite"

/**
 * What an invitation link is doing right now.
 *
 * Three states rather than a boolean, because the two dead ones are dead for
 * different reasons and the fix differs: a revoked link was deliberately killed
 * and wants replacing, an expired one outlived the event and wants a new one
 * with a later date.
 */
export type InviteState = "live" | "revoked" | "expired"

export interface InviteRow {
  id: string
  token: string
  /** The organiser's own reminder of who it went to. Empty when they left it blank. */
  note: string
  state: InviteState
  /** The full URL to paste into a mailing. */
  url: string
  createdAt?: Date
  expiresAt?: Date
  revokedAt?: Date
}

/**
 * The URL an invitee is sent.
 *
 * `origin` comes from `event.url.origin` rather than a constant, because there
 * is no configured public base URL to read. Under `adapter-node` that resolves
 * from the `ORIGIN` environment variable (or the forwarded-host headers), so a
 * deployment behind a proxy that sets neither will hand organisers an internal
 * hostname to mail out. That is a deployment setting, not something this can
 * work around — but it is why the page shows the whole URL rather than a
 * reassuring "Copy link" button with nothing visible behind it.
 */
export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/invite/${token}`
}

/**
 * Which state an invite is in.
 *
 * Revoked beats expired, matching the order the backend checks them in
 * (`PreviewInvite`, `hackathon_service.go:390`): a link that was revoked *and*
 * has since expired is reported as revoked, because that is the thing somebody
 * did on purpose.
 *
 * `expiresAt` absent means no expiry at all. That is reachable — `CreateInvite`
 * only defaults it to the hackathon's `ends_at` when the hackathon *has* one,
 * and a hackathon may be created without dates — so a missing expiry is a link
 * that never lapses, not a broken row.
 *
 * `now` is a parameter so this is testable at a boundary rather than at
 * whatever the clock happens to say.
 */
export function inviteState(
  invite: Pick<HackathonInvite, "revokedAt" | "expiresAt">,
  now: Date,
): InviteState {
  if (invite.revokedAt) return "revoked"
  // `<=` rather than `<`: the backend refuses on `expires_at.Before(now)`, so at
  // the exact millisecond it is still live. Erring the other way would show a
  // link as dead while it still works.
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime())
    return "expired"

  return "live"
}

/**
 * The invites of one hackathon, ready to render: newest first, each with its
 * state and its full URL.
 *
 * Newest first because the top of the list is the link an organiser just made
 * and came here to copy. Ties break on id so the order is total — two invites
 * minted in the same request share a `created_at` to the millisecond, which the
 * seed's own fixture does.
 */
export function inviteRows(
  invites: readonly HackathonInvite[],
  origin: string,
  now: Date,
): InviteRow[] {
  return [...invites]
    .sort(
      (a, b) =>
        (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) ||
        a.id.localeCompare(b.id),
    )
    .map((i) => ({
      id: i.id,
      token: i.token,
      note: i.note ?? "",
      state: inviteState(i, now),
      url: inviteUrl(origin, i.token),
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      revokedAt: i.revokedAt,
    }))
}

/** The live links, which are the only ones worth mailing. */
export function liveInvites(rows: readonly InviteRow[]): InviteRow[] {
  return rows.filter((r) => r.state === "live")
}

/** The dead ones, kept on screen so revoking is visibly a thing that happened. */
export function deadInvites(rows: readonly InviteRow[]): InviteRow[] {
  return rows.filter((r) => r.state !== "live")
}
