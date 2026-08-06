import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { fail, redirect } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// The account page: what the platform knows about you, what you can change,
// and how to leave.
//
// DeleteAccount and EditProfile are both self-service by design — neither
// takes a user id, so this page can only ever touch the caller's own profile.

export const load: PageServerLoad = async (event) => {
  return {
    user: event.locals.platformUser ?? null,
    // Keycloak owns the credentials, so "change my email/password" has to
    // happen in its own account console. Deriving the link from the configured
    // issuer keeps it correct through the tunnel, where the issuer moves.
    identityConsoleUrl: `${event.locals.config.oidc.issuer}/account`,
  }
}

export const actions: Actions = {
  profile: async (event) => {
    const { user } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    const displayName = String(form.get("displayName") ?? "").trim()
    if (!displayName) {
      // Echo the typed value back so a rejected save does not also wipe the
      // field the person was editing.
      return fail(400, {
        displayName,
        profileMessage: "Your display name cannot be empty.",
      })
    }

    // The rest of the profile. Sent as typed, empty included: these MAY be
    // cleared, and an absent field would read as "leave unchanged" — which
    // would make removing your dietary requirements impossible.
    const affiliation = String(form.get("affiliation") ?? "").trim()
    const skills = String(form.get("skills") ?? "").trim()
    const dietary = String(form.get("dietary") ?? "").trim()
    const avatarUrl = String(form.get("avatarUrl") ?? "").trim()

    try {
      await user.editProfile({ displayName, affiliation, skills, dietary, avatarUrl })
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.INVALID_ARGUMENT) {
        return fail(400, {
          displayName,
          affiliation,
          skills,
          dietary,
          avatarUrl,
          profileMessage: e.details || "That profile is not valid.",
        })
      }
      throw e
    }

    return { profileSaved: true }
  },

  delete: async (event) => {
    const { user } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    // Typing the username is the confirmation: this removes the profile and
    // every role, and nothing here can undo it.
    const typed = String(form.get("confirm") ?? "").trim()
    const expected = event.locals.platformUser?.username ?? ""
    if (!expected || typed !== expected) {
      return fail(400, {
        message: `Type your username (${expected}) exactly to confirm.`,
      })
    }

    try {
      await user.deleteAccount({})
    } catch (e) {
      if (e instanceof ClientError && e.code === Status.FAILED_PRECONDITION) {
        // Authored content is Restrict-guarded: the backend refuses rather
        // than cascading away pages or submissions other people rely on.
        return fail(409, {
          message:
            e.details ||
            "Your profile still owns content an organizer must reassign or remove first.",
        })
      }
      throw e
    }

    // The Keycloak identity survives deletion, so sign out to clear the
    // session rather than leaving a token for a profile that no longer exists.
    redirect(303, "/signout")
  },
}
