import { test, expect, type Page } from "@playwright/test"
import { storageStatePath } from "../../helpers/state.js"
import { myHackathonId } from "../../helpers/discover.js"
import { PERSONAS, SEED_HACKATHONS } from "../../personas.js"

// Promoting a participant to co-organizer, and demoting them again.
//
// AddOwner/RemoveOwner were proto-only stubs returning Unimplemented, with no
// caller anywhere — the last of the B15 audit's dormant RPCs. Unlike
// AddRole/RemoveRole they were never a shipped 500, because nothing had ever
// called them; the bug was that a hackathon's organizer could not recruit a
// co-organizer at all, so a global admin had to be in the loop for every event.
//
// Ownership on this branch is a casbin fact, not a column, so what these
// assertions really check is that the role the RPC writes is the one
// ListMembers reads back.
//
// Asserted against the CARD view, which is what the page opens on. The table is
// the same two snippets.

const BOB = PERSONAS.bob.displayName
const ALICE = PERSONAS.alice.displayName

/** Alice owns h1; bob is a confirmed member of it. */
async function participantsPage(page: Page): Promise<void> {
  const id = await myHackathonId(page, SEED_HACKATHONS.h1.name)
  await page.goto(`/my/hackathon/${id}/participants`)
  await page.waitForLoadState("networkidle")
}

function card(page: Page, name: string) {
  return page.locator(".card").filter({ hasText: name }).first()
}

/**
 * The role LINE, not the card.
 *
 * The card also holds a button named "Make organizer", so a card-level
 * /organizer/i assertion is true whether or not the person is one — it passed
 * on promotion for the wrong reason and failed on demotion for the right one.
 * Third time this family of mistake has shown up; assert on the element that
 * states the fact.
 */
function role(page: Page, name: string) {
  return card(page, name).locator("p").first()
}

test.describe.configure({ mode: "serial" })

test.describe("hackathon co-organizers", () => {
  test.use({ storageState: storageStatePath("alice") })

  test("an organizer can promote a member and demote them again", async ({
    page,
  }) => {
    await participantsPage(page)

    await expect(card(page, BOB)).toBeVisible()
    await card(page, BOB).getByRole("button", { name: "Make organizer" }).click()
    await page.waitForLoadState("networkidle")

    await expect(
      role(page, BOB),
      "the role line should read back the casbin role the RPC wrote",
    ).toHaveText("Owner")
    await expect(
      card(page, BOB).getByRole("button", { name: "Make organizer" }),
      "already an owner — the promote control should be gone",
    ).toHaveCount(0)

    // And back down. Demote restores Member rather than leaving the person
    // with no role at all, which renders as a participant with a blank role.
    await card(page, BOB).getByRole("button", { name: "Step down" }).click()
    await page.waitForLoadState("networkidle")

    await expect(
      role(page, BOB),
      "demoted to Member, not to no role at all",
    ).toHaveText("Member")
    await expect(
      card(page, BOB).getByRole("button", { name: "Make organizer" }),
      "promotable again",
    ).toHaveCount(1)
  })

  test("an organizer is not offered a control to demote themselves", async ({
    page,
  }) => {
    await participantsPage(page)

    // Promote bob first, so a second owner exists. Without that the assertion
    // below would pass on the last-organizer guard instead of the self guard,
    // and would keep passing if the self guard were deleted.
    await card(page, BOB).getByRole("button", { name: "Make organizer" }).click()
    await page.waitForLoadState("networkidle")
    await expect(
      card(page, BOB).getByRole("button", { name: "Step down" }),
      "with two owners, demotion is on offer for the OTHER one",
    ).toHaveCount(1)

    // Same reasoning as Admin in /manage/users: the permission you would give
    // up is the one that would let you undo it. The backend refuses it, and the
    // page does not offer it, so the refusal is never how you find out.
    await expect(
      card(page, ALICE).getByRole("button", { name: "Step down" }),
    ).toHaveCount(0)

    await card(page, BOB).getByRole("button", { name: "Step down" }).click()
    await page.waitForLoadState("networkidle")
  })
})
