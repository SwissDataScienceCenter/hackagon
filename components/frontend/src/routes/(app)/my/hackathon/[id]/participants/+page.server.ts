import type { PageServerLoad } from "./$types"

// The roster is already in the layout payload: `+layout.server.ts` calls
// hackathon.get(), which embeds every member (user + casbin role +
// is_waiting + joined_at). A second identical RPC here would buy nothing, so
// this load only reshapes what the parent resolved — same approach as
// ../timeline. Access was decided by the backend on that Get: a non-member
// never reaches this page, so there is no ClientError left to translate.
export const load: PageServerLoad = async (event) => {
  const { hackathon, myMembership } = await event.parent()

  const meId = myMembership?.user?.id

  // `user` is optional on the wire; a member row without one carries no name
  // to show, so it is dropped rather than rendered as a blank person.
  const rows = hackathon.members.flatMap((m) =>
    m.user
      ? [
          {
            id: m.user.id,
            name: m.user.displayName || m.user.username,
            username: m.user.username,
            role: m.role,
            isWaiting: m.isWaiting,
            joinedAt: m.joinedAt ?? null,
            isMe: m.user.id === meId,
          },
        ]
      : [],
  )

  // HackathonRole: UNSPECIFIED=0, OWNER=1, MEMBER=2. Organizers first, then
  // alphabetical, so the order is stable between loads.
  rows.sort((a, b) => {
    if ((a.role === 1) !== (b.role === 1)) return a.role === 1 ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return {
    confirmed: rows.filter((r) => !r.isWaiting),
    waitlisted: rows.filter((r) => r.isWaiting),
  }
}
