import type { Locator, Page } from "@playwright/test"

/** Dashboard section by its heading ("Your hackathons" / "Other hackathons"). */
export function dashboardSection(page: Page, heading: string): Locator {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: heading }) })
}

/**
 * A hackathon row — link, membership badge, edit control — inside a dashboard
 * section.
 *
 * Reached as the LINK'S GRANDPARENT rather than by class list. The badges have
 * now lived in three places: beside the link, inside it, and (this design)
 * beside it again in a sibling `div`, while the wrapper's classes changed with
 * every one of those moves. What did not change is the relationship: the row is
 * the thing the link is mounted in.
 *
 * Anchoring on the link alone — which is what this did — finds the hackathon
 * but none of the controls around it, so a membership badge assertion fails
 * with "element(s) not found" while the badge is plainly on screen.
 */
export function dashboardRow(section: Locator, hackathonName: string): Locator {
  return section
    .locator("a")
    .filter({ hasText: hackathonName })
    .first()
    .locator("xpath=../..")
}

/**
 * The page's CONTENT, excluding the chrome — what "the page shows X" means.
 *
 * The signed-in account menu is a native <details> in the header, so its
 * contents (including the user's own name and email) are in the DOM at all
 * times and merely hidden when closed. A document-wide
 * getByText("Bob Henderson") therefore matches the menu entry first and fails
 * with "hidden" while asserting about a team roster. Both layouts render a
 * <main>, so scoping there is exact rather than a workaround.
 */
export function content(page: Page): Locator {
  return page.locator("main")
}

/** A hackathon row on the anonymous home page. */
export function homeRow(page: Page, hackathonName: string): Locator {
  return page
    .locator('a[href^="/hackathon/"]')
    .filter({ hasText: hackathonName })
    .first()
}
