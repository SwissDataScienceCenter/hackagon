import type { PageServerLoad } from "./$types"

// The hackathon's own description, rendered as the markdown it is written in.
//
// It used to be a clamped subtitle in the overview's hero, where markdown had
// nowhere to render and showed up as literal `##` and `-`. This page is the
// destination the sidebar's About entry points at, offered only when there is a
// description to read (see `memberNav`).
export const load: PageServerLoad = async (event) => {
  // No RPC of its own: the layout's `hackathon.get` already carries the
  // description, so the entry that offers this page and the page itself cannot
  // disagree about whether there is one.
  const { hackathon } = await event.parent()

  return {
    name: hackathon.name,
    description: hackathon.description,
    // The same address the overview's hero draws. Carried here because About is
    // the one member page whose subject *is* the hackathon — everywhere else the
    // picture would be decoration above someone's real errand.
    logo: hackathon.logo,
  }
}
