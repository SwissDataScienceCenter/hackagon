import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { ownerMembership } from "$lib/server/hackathon/membership"
import { profileLinksOf } from "$lib/server/user/profileLinks"
import {
  ADMIN_ROLE,
  PLATFORM_ROLE_CHOICES,
  NO_PLATFORM_ROLE,
  planPlatformRoleChange,
  platformRoleChoiceLabel,
} from "$lib/utils/globalRole"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

export const load: PageServerLoad = async (event) => {
  const { user, hackathon } = requireGrpc(event.locals.grpc)
  const userId = event.params.id

  // `UserService.Get` needs user:read, which only a global admin holds, so it is
  // what gates this page. The two lists are not gated that way — `List` answers
  // anyone — but they fail with it here, since Promise.all rejects on the first.
  //
  // Two lists for the same reason as on the dashboard: `Create` makes its caller
  // an owner without a Participant row, so a hackathon someone created and never
  // joined is only on the second one.
  let result
  try {
    result = await Promise.all([
      user.get({ userId }),
      hackathon.list({ participantId: userId }),
      hackathon.list({ ownerId: userId }),
    ])
  } catch (e) {
    if (e instanceof ClientError && e.code === Status.PERMISSION_DENIED) {
      error(403, "You don't have permission to view users")
    }
    // A malformed id is refused as INVALID_ARGUMENT before it is looked up;
    // to the person who followed the link it is the same missing user.
    if (
      e instanceof ClientError &&
      (e.code === Status.NOT_FOUND || e.code === Status.INVALID_ARGUMENT)
    ) {
      error(404, "No such user")
    }
    throw e
  }
  const [{ user: u }, participating, owned] = result
  if (!u) error(404, "No such user")

  const participatingIds = new Set(participating.hackathons.map((h) => h.id))
  const ownedOnly = owned.hackathons
    .filter((h) => !participatingIds.has(h.id))
    .map((h) => ({ ...h, viewerMembership: ownerMembership(u, h.createdAt) }))

  // Newest first: the hackathon an admin is asking about is usually the one
  // running now, not the one from two years ago.
  const hackathons = [...participating.hackathons, ...ownedOnly]
    .sort(
      (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
    )
    .map((h) => ({
      id: h.id,
      name: h.name,
      logo: h.logo,
      startsAt: h.startsAt,
      endsAt: h.endsAt,
      status: h.status,
      visibility: h.visibility,
      // `viewerMembership` is this user's, not the viewer's: List fills it in
      // for whoever `participantId` names.
      role: h.viewerMembership?.role ?? 0,
      isWaiting: h.viewerMembership?.isWaiting ?? false,
      // Whether the hackathon's participant management knows this user. Its
      // per-person page looks them up among the participant rows, so an owner
      // who never joined their own hackathon would land on a 404 there.
      hasParticipantRow: participatingIds.has(h.id),
      // Who sets this user's role there. List fills `owners` in for any
      // hackathon the caller may read — every one, for an admin — despite the
      // proto comment saying Get only; checked against the running server.
      owners: h.owners.map((o) => ({
        id: o.id,
        name: o.displayName || o.username,
      })),
    }))

  return {
    user: {
      id: u.id,
      displayName: u.displayName,
      username: u.username,
      email: u.email,
      createdAt: u.createdAt,
      roles: u.roles,
    },
    links: profileLinksOf(u),
    hackathons,
    // So the template can lock the role picker on your own page — a courtesy,
    // not the real gate: `RemoveRole` refuses an admin removing their own Admin
    // role regardless, and on this page every change you could make to yourself
    // is that one.
    currentUserId: event.locals.platformUser?.id,
  }
}

// The refusals worth naming to an admin. Anything else is a fault rather than
// an answer, and is left to throw — unless half the change already went
// through, when saying what happened matters more than the error page.
function refusal(e: unknown): { status: number; message: string } | undefined {
  if (!(e instanceof ClientError)) return undefined
  switch (e.code) {
    case Status.PERMISSION_DENIED:
      return {
        status: 403,
        message: "You don't have permission to change platform roles",
      }
    case Status.NOT_FOUND:
      return { status: 404, message: "That user no longer exists" }
    case Status.INVALID_ARGUMENT:
      return { status: 400, message: e.details }
  }
  return undefined
}

export const actions: Actions = {
  setRole: async (event) => {
    const { user } = requireGrpc(event.locals.grpc)
    const userId = event.params.id
    const formData = await event.request.formData()
    const target = Number(formData.get("role"))

    if (!PLATFORM_ROLE_CHOICES.includes(target)) {
      return fail(400, { success: false, message: "Pick a role" })
    }

    // Read now rather than trusting what the page showed: another admin may
    // have changed this user's roles since it loaded.
    let current: number[]
    let username: string
    try {
      const u = (await user.get({ userId })).user
      current = u?.roles ?? []
      username = u?.username ?? ""
    } catch (e) {
      const r = refusal(e)
      if (!r) throw e
      return fail(r.status, { success: false, message: r.message })
    }

    // Granting Admin hands over every hackathon and this page, so it takes the
    // username typed back. Checked here as well as in the form, so a resubmit
    // or a hand-built request cannot skip it. A guard against slips, not an
    // access check: `AddRole` still decides who may grant.
    if (
      target === ADMIN_ROLE &&
      !current.includes(ADMIN_ROLE) &&
      String(formData.get("confirm") ?? "").trim() !== username
    ) {
      return fail(400, {
        success: false,
        message: "Type the username to confirm making them an Admin",
      })
    }

    const { revoke, grant } = planPlatformRoleChange(current, target)
    const revoked: number[] = []
    try {
      for (const role of revoke) {
        await user.removeRole({ userId, role })
        revoked.push(role)
      }
      if (grant !== undefined) await user.addRole({ userId, role: grant })
    } catch (e) {
      const r = refusal(e)
      // Two calls, not one transaction. When the first went through and the
      // second did not, the user is in neither the state they were in nor the
      // one asked for, and the message has to say which.
      if (revoked.length > 0) {
        const names = revoked.map(platformRoleChoiceLabel).join(" and ")
        return fail(r?.status ?? 500, {
          success: false,
          message: `Revoked ${names}, but the change didn't finish: ${
            r?.message ?? "the server failed"
          }`,
        })
      }
      if (!r) throw e
      return fail(r.status, { success: false, message: r.message })
    }

    return {
      success: true,
      message:
        target === NO_PLATFORM_ROLE
          ? "Platform role removed"
          : `Now ${platformRoleChoiceLabel(target)}`,
    }
  },
}
