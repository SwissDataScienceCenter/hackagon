import type { PageServerLoad } from "./$types"
import { resolve } from "$app/paths"
import { redirect } from "@sveltejs/kit"

// Manage Forms has no landing page of its own: it is a set of tabs, and the
// first of them is the registration form. This route exists so the sidebar can
// name the section rather than one of its tabs — `activeNavId` matches by
// longest path prefix, so an entry pointing here keeps itself lit across every
// form nested under it, which an entry pointing straight at a tab could not do.
//
// A tile of form descriptions was the alternative and would restate the tab bar
// a click earlier. There is nothing to decide here, so this decides nothing.
export const load: PageServerLoad = (event) => {
  redirect(
    303,
    resolve(`/my/hackathon/${event.params.id}/manage/forms/registration`),
  )
}
