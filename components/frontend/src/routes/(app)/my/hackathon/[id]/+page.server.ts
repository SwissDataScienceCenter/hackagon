import { redirect } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"

// `/my/hackathon/<id>` had no page of its own, so it answered 404 — for a URL
// that is the obvious thing to type, and the one the address bar is left showing
// after backing out of a sub-page.
//
// Overview rather than a page here: this subtree is a shell of tabs and Overview
// is its first, which is where every link into the hackathon already points.
export const load: PageServerLoad = (event) => {
  redirect(307, `/my/hackathon/${event.params.id}/overview`)
}
