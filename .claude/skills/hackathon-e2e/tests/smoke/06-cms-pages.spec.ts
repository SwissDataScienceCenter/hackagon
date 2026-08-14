import { test, expect } from "@playwright/test"
import { PERSONAS } from "../../personas.js"
import { anonymousContext, contextFor } from "../../helpers/login.js"
import { storageStatePath } from "../../helpers/state.js"

// The platform CMS driven through its real admin UI (/manage/pages), not the
// API — act 0 in the journey recipe already covers SitePageService directly.
// This walks the whole authoring lifecycle a human performs: create a draft,
// confirm the public cannot see it, publish, edit the content, then delete.
//
// The page is created and removed inside this spec, so the shared seeded
// database is left exactly as it was found.

const SLUG = "code-of-conduct"
const TITLE = "Code of conduct"
// Markdown, so the assertions also prove the sanitizing render pipeline runs
// on SitePage content: `##` must become a heading and `**` bold.
const CONTENT = [
  "## Be excellent to each other",
  "",
  "Harassment is **not tolerated** at any Hackagon event.",
].join("\n")
const EDITED_MARKER = "Report concerns to the organizers"

test.describe.configure({ mode: "serial" })

test.describe("platform CMS: /manage/pages", () => {
  test.use({ storageState: storageStatePath(PERSONAS.admin.key) })

  test("admin creates a draft, publishes, edits and deletes a page", async ({
    page,
    browser,
  }) => {
    // --- create, as a draft -------------------------------------------------
    await page.goto("/manage/pages")
    await page.waitForLoadState("networkidle")
    await expect(
      page.getByRole("heading", { name: "Platform pages" }),
    ).toBeVisible()

    // A previous failed run may have left the page behind; slugs are unique,
    // so Create would fail with AlreadyExists. Clear it first.
    const stale = page.locator(".card", { hasText: TITLE })
    if ((await stale.count()) > 0) {
      await stale
        .first()
        .locator('form[action="?/delete"]')
        .getByRole("button")
        .click()
      await expect(page.locator(".card", { hasText: TITLE })).toHaveCount(0)
    }

    await page.getByRole("button", { name: "New page" }).click()
    // Scope to the create form: every existing row carries hidden `slug`
    // inputs in its edit/delete forms, so a bare input[name="slug"] is
    // ambiguous once any page exists.
    const createForm = page.locator('form[action="?/create"]')
    await createForm.locator('input[name="slug"]').fill(SLUG)
    await createForm.locator('input[name="title"]').fill(TITLE)
    await createForm.locator('textarea[name="content"]').fill(CONTENT)
    // "Published" deliberately left unchecked — drafts must stay private.
    await createForm.getByRole("button", { name: "Create page" }).click()

    const row = page.locator(".card", { hasText: TITLE })
    await expect(row).toBeVisible()
    // Assert the STATUS BADGE, not any text: the edit form carries a
    // "Published" checkbox label with the same words, so a bare getByText
    // passes before the save has even happened and races the next step.
    const badge = row.locator("span.badge")
    await expect(badge).toHaveText("Draft")

    // --- a draft is invisible to the public ---------------------------------
    // The backend reports NotFound rather than PermissionDenied, so a draft is
    // indistinguishable from a page that was never created.
    const anon = await anonymousContext(browser)
    const anonPage = await anon.newPage()
    let resp = await anonPage.goto(`/${SLUG}`)
    expect(resp?.status(), "an unpublished page must not be readable").toBe(404)

    // --- publish ------------------------------------------------------------
    await row.getByRole("button", { name: "Edit" }).click()
    const editForm = row.locator('form[action="?/edit"]')
    await editForm.locator('input[name="visible"]').check()
    await editForm.getByRole("button", { name: "Save changes" }).click()
    await expect(editForm).toHaveCount(0)
    await expect(badge).toHaveText("Published")

    resp = await anonPage.goto(`/${SLUG}`)
    expect(resp?.status(), "a published page must be publicly readable").toBe(
      200,
    )
    await expect(anonPage.getByRole("heading", { name: TITLE })).toBeVisible()
    // Markdown was parsed, not dumped as source.
    await expect(
      anonPage.getByRole("heading", { name: "Be excellent to each other" }),
    ).toBeVisible()
    await expect(anonPage.locator(".markdown-content strong")).toHaveText(
      "not tolerated",
    )

    // --- edit the content ---------------------------------------------------
    await page.reload()
    await page.waitForLoadState("networkidle")
    const liveRow = page.locator(".card", { hasText: TITLE })
    await liveRow.getByRole("button", { name: "Edit" }).click()
    const liveEdit = liveRow.locator('form[action="?/edit"]')
    await liveEdit
      .locator('textarea[name="content"]')
      .fill(`${CONTENT}\n\n${EDITED_MARKER}.`)
    await liveEdit.getByRole("button", { name: "Save changes" }).click()
    // The editor unmounts once the action resolves (use:enhance sets
    // editing = null), so this is the completion signal. Without it the next
    // navigation races the save and reads the pre-edit content.
    await expect(liveEdit).toHaveCount(0)

    await anonPage.goto(`/${SLUG}`)
    await expect(anonPage.getByText(EDITED_MARKER)).toBeVisible()

    // --- delete, and the public URL goes with it ----------------------------
    await page.reload()
    await page.waitForLoadState("networkidle")
    await page
      .locator(".card", { hasText: TITLE })
      .locator('form[action="?/delete"]')
      .getByRole("button", { name: "Delete" })
      .click()
    await expect(page.locator(".card", { hasText: TITLE })).toHaveCount(0)

    resp = await anonPage.goto(`/${SLUG}`)
    expect(resp?.status(), "a deleted page must stop resolving").toBe(404)

    await anon.close()
  })

  test("a non-admin cannot reach the CMS", async ({ browser }) => {
    // alice is a hackathon organizer, not a platform admin: site pages are
    // global, so her per-hackathon Owner role grants nothing here.
    const ctx = await contextFor(browser, PERSONAS.alice.key)
    const alicePage = await ctx.newPage()
    const resp = await alicePage.goto("/manage/pages")
    expect(
      resp?.status(),
      "organizers must not administer platform pages",
    ).toBe(403)
    await ctx.close()
  })
})
