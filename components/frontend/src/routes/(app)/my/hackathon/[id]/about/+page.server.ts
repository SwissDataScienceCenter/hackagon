import type { PageServerLoad } from "./$types"

// The hackathon's identity page: the layout's hero and phase bar, who runs it,
// then the description rendered as the markdown it is written in.
//
// The description used to sit at the foot of the overview, under every card a
// member came back for, so a first visit had to scroll past "Right now" to learn
// what the hackathon was. The hero used to head the overview too; both moved
// here so the overview is only about where the viewer stands.
export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already carries the
  // description and the owners.
  const { hackathon } = await event.parent()

  return {
    description: hackathon.description,
    // Names only. `owners` are full `User`s, email included, and a participant
    // has no business with an organiser's address — so nothing else leaves the
    // server. Same display-name-then-username precedence as everywhere else.
    ownerNames: hackathon.owners.map(
      (u) => u.displayName || u.username || "Unknown",
    ),
  }
}
