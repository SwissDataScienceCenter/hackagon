import type { Back } from "./backLink"

/**
 * The back target decided for the navigation now landing, and the URL it is
 * for. The app layout decides it in `onNavigate`, before the new page renders,
 * and stores it on that page's history entry once it has — so `BackLink` can
 * read it here in between, and its label is right on the first paint.
 *
 * Cleared on Back and Forward: the entry they land on carries its own.
 */
export const pendingBack = $state<{ href: string; back: Back | undefined }>({
  href: "",
  back: undefined,
})
