import { redirect } from "@sveltejs/kit"
import type { PageLoad } from "./$types"

// The tab layout has no content of its own — the bare URL lands on the first
// tab of the sub-nav (see +layout.svelte).
export const load: PageLoad = ({ params }) => {
  redirect(307, `/my/hackathon/${params.id}/overview`)
}
