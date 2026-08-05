import type { Actions, PageServerLoad } from "./$types"
import { requireGrpc } from "$lib/server/grpc/client"
import { GlobalRole } from "$lib/server/grpc/generated/user/entities/global_role"
import { mayManagePhases } from "$lib/server/hackathon/capabilities"
import { error, fail } from "@sveltejs/kit"
import { ClientError, Status } from "nice-grpc-common"

// The copy this event sends people, and the audiences it sends it to.
//
// Nothing here delivers mail: Hackagon has no notification service, and
// pretending otherwise would be the worst outcome — an organiser believing a
// deadline reminder went out. So the page does the two things it honestly can:
// store the copy (`SetEmailTemplates`) and hand it to the mail client the
// organiser already uses, addressed to the right group.
//
// The four moments are fixed backend-side (`emailTemplateKeys` in
// config_service.go) because the day a notification service does land, it will
// send them by name. A free-form list would be unaddressable.

/** HackathonRole: OWNER=1. */
const OWNER = 1

const MOMENTS = [
  {
    key: "registrationConfirmed",
    label: "Registration confirmed",
    hint: "Sent when someone's place is confirmed — the first mail they get from you.",
  },
  {
    key: "teamAssigned",
    label: "Team assigned",
    hint: "Who they are working with, and where to find them.",
  },
  {
    key: "deadlineReminder",
    label: "Deadline reminder",
    hint: "The one people act on. Say what closes and when, not that something closes.",
  },
  {
    key: "results",
    label: "Results",
    hint: "Sent after the awards are finalised.",
  },
] as const

function formError(e: unknown) {
  if (e instanceof ClientError) {
    if (e.code === Status.PERMISSION_DENIED)
      return fail(403, { message: "Only this event's organisers can do that." })
    if (e.code === Status.INVALID_ARGUMENT) return fail(400, { message: e.details })
  }
  throw e
}

export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()
  const { config } = requireGrpc(event.locals.grpc)

  const isAdmin = (event.locals.platformUser?.roles ?? []).includes(
    GlobalRole.GLOBAL_ROLE_ADMIN,
  )
  if (!mayManagePhases(myMembership ?? undefined, isAdmin)) {
    error(403, "Only this event's organisers can write its notification copy")
  }

  // Prefilled, because Set replaces the whole map — see GetEmailTemplates.
  const { templates } = await config.getEmailTemplates({ hackathonId: event.params.id })

  // Audiences are derived from the roster rather than typed by hand: the point
  // of composing here rather than in a mail client is that the address list is
  // never stale. Waitlisted people are their own group — they are exactly who
  // an organiser writes to separately, and exactly who must not receive
  // "you're in".
  const members = hackathon.members ?? []
  const person = (m: (typeof members)[number]) => ({
    email: m.user?.email ?? "",
    name: m.user?.displayName || m.user?.username || "",
  })

  return {
    moments: MOMENTS.map((m) => ({
      ...m,
      subject: templates[`${m.key}Subject`] ?? "",
      body: templates[m.key] ?? "",
    })),
    eventName: hackathon.name,
    audiences: [
      {
        id: "confirmed",
        label: "Confirmed participants",
        people: members.filter((m) => !m.isWaiting).map(person),
      },
      {
        id: "waitlist",
        label: "Waitlisted",
        people: members.filter((m) => m.isWaiting).map(person),
      },
      {
        id: "organisers",
        label: "Organisers",
        people: members.filter((m) => m.role === OWNER).map(person),
      },
    ],
  }
}

export const actions: Actions = {
  save: async (event) => {
    const { config } = requireGrpc(event.locals.grpc)
    const form = await event.request.formData()

    // Every moment is posted every time, empty included: Set replaces the map,
    // so omitting a blank field would be indistinguishable from clearing it —
    // and clearing it is a thing an organiser may legitimately want.
    const templates: Record<string, string> = {}
    for (const m of MOMENTS) {
      templates[m.key] = String(form.get(m.key) ?? "")
      templates[`${m.key}Subject`] = String(form.get(`${m.key}Subject`) ?? "")
    }

    try {
      await config.setEmailTemplates({ hackathonId: event.params.id, templates })
    } catch (e) {
      return formError(e)
    }

    return { saved: true }
  },
}
