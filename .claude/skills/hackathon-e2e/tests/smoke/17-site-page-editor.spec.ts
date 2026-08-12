import { test, expect, type Locator } from "@playwright/test"
import { PERSONAS, SEED_HACKATHONS } from "../../personas.js"
import { anonymousContext, contextFor } from "../../helpers/login.js"
import { storageStatePath } from "../../helpers/state.js"
import { generateLogoPng } from "../../helpers/files.js"
import { myHackathonId } from "../../helpers/discover.js"

// The platform-pages editor (/manage/pages), reported by a user in three parts:
//
//   "the text entry box is the same background and doesn't extend to the size
//    of the width, can we have a button to preview the markdown, and also the
//    upload button we have in others sections?"
//
// All three were one omission. /manage/pages was the last markdown surface in
// the app still using a bare <textarea> instead of MarkdownEditor — which has
// the Write/Preview tabs and the image button — and that textarea carried
// `field-area` WITHOUT `field`, i.e. only the multi-line modifier and none of
// the recipe that draws a box. Tailwind's preflight makes a bare textarea
// transparent, borderless and `cols`-wide, so it rendered as an invisible box
// the colour of the card behind it, about twenty characters across.
//
// Each test therefore states one of the three complaints as a fact about the
// element that carries it, never about a container that merely holds the word.

/** Deterministic 96x96 PNG — same bytes on every machine, every run. */
const PNG = generateLogoPng(1707)

const SLUG = "platform-image-test"
const TITLE = "Platform image test"

/** The create form. Every existing row also carries name=content/name=slug
 *  inputs in its edit form, so an unscoped locator is ambiguous. */
function createForm(page: import("@playwright/test").Page): Locator {
  return page.locator('form[action="?/create"]')
}

/**
 * "This textarea draws as a control, not as a hole in the page."
 *
 * Measured in the browser because this is a CSS fault and nothing in the markup
 * would have shown it. Note the FIRST assertion: "its background differs from
 * the card's" would have passed on the broken version too — transparent is a
 * different value from the card's colour. The fault is that it has no colour of
 * its own, so that is what gets asserted.
 */
async function expectDrawsAsField(area: Locator, what: string): Promise<void> {
  // A hidden textarea measures 0 wide and would make the ratio meaningless, so
  // prove it is the pane on screen first.
  await expect(area).toBeVisible()

  const box = await area.evaluate((el) => {
    const own = getComputedStyle(el)
    const behind = el.closest("form, .card")
    const wrapper = el.parentElement

    return {
      background: own.backgroundColor,
      borderTopWidth: own.borderTopWidth,
      behindBackground: behind ? getComputedStyle(behind).backgroundColor : "none",
      width: el.getBoundingClientRect().width,
      wrapperWidth: wrapper ? wrapper.getBoundingClientRect().width : 0,
    }
  })

  expect(
    box.background,
    `${what}: must have its own background, not the page's`,
  ).not.toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/)
  expect(
    box.background,
    `${what}: must not be the same colour as what it sits on`,
  ).not.toBe(box.behindBackground)
  expect(
    parseFloat(box.borderTopWidth),
    `${what}: must have a visible border`,
  ).toBeGreaterThan(0)

  // Full width of the space it was given. Broken, a textarea falls back to its
  // `cols` default — roughly 20 characters, a fifth of the form.
  expect(box.wrapperWidth).toBeGreaterThan(200)
  expect(
    box.width / box.wrapperWidth,
    `${what}: must fill the width available to it`,
  ).toBeGreaterThan(0.98)
}

/** Removes the page this spec creates, so the shared seed is left as found. */
async function deletePageIfPresent(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.goto("/manage/pages")
  await page.waitForLoadState("networkidle")
  const row = page.locator(".card", { hasText: TITLE })
  if ((await row.count()) > 0) {
    await row.first().locator('form[action="?/delete"]').getByRole("button").click()
    await expect(page.locator(".card", { hasText: TITLE })).toHaveCount(0)
  }
}

// Deliberately NOT serial, unlike 06-cms-pages. These four assert about four
// independent things, and the upload test clears its own leftovers on the way
// IN — so nothing needs the run to be a chain. Under `mode: "serial"` a red
// styling test skipped the upload and authorization tests entirely, which is
// the wrong trade: one broken CSS class would hide whether uploads still work.
// The config runs one worker, so they stay in order regardless.

test.describe("platform page editor", () => {
  test.use({ storageState: storageStatePath(PERSONAS.admin.key) })

  // --- complaint 1: the box ------------------------------------------------
  //
  // Both a narrow and a wide viewport: "fills the width" is the half of the
  // complaint that only means something once there is width to fill.
  for (const width of [390, 1280]) {
    test(`the content editor draws as a real field at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto("/manage/pages")
      await page.waitForLoadState("networkidle")
      await page.getByRole("button", { name: "New page" }).click()

      await expectDrawsAsField(
        createForm(page).locator("textarea[name=content]"),
        "the platform page editor",
      )
    })
  }

  // --- complaint 2: preview, and the attack surface it adds ----------------
  test("Preview renders the markdown and does not execute it", async ({
    page,
  }) => {
    await page.goto("/manage/pages")
    await page.waitForLoadState("networkidle")
    await page.getByRole("button", { name: "New page" }).click()

    const form = createForm(page)
    // The same payload act0.about.xss pastes into a real page. The preview is a
    // NEW place this content gets rendered — in the admin's own browser, with
    // the admin's session — so it has to go through the same sanitizing
    // pipeline the public page does.
    await form.locator("textarea[name=content]").fill(
      [
        "## Be excellent to each other",
        "",
        "Harassment is **not tolerated** at any Hackagon event.",
        "",
        '<script>window.__pwned = true</script>',
        "",
        '<img src=x onerror="window.__pwned = true">',
      ].join("\n"),
    )

    // Set the sentinel AFTER typing and BEFORE rendering, so a truthy value can
    // only have come from the preview.
    await page.evaluate(() => {
      ;(window as unknown as { __pwned?: boolean }).__pwned = false
    })

    await form.getByRole("button", { name: "Preview" }).click()

    // Markdown was PARSED, not printed. Assert the rendered elements, not the
    // text: the textarea still holds the source, so a text match would pass
    // whether or not anything rendered.
    const preview = form.locator(".markdown-content")
    await expect(preview.locator("h2")).toHaveText("Be excellent to each other")
    await expect(preview.locator("strong")).toHaveText("not tolerated")

    // Nothing survived that could execute. These two are the load-bearing
    // assertions and they are DELIBERATELY FIRST: they read the DOM, so they are
    // deterministic. Verified against a build with DOMPurify removed from
    // renderMarkdown — the script count came back 1.
    await expect(
      preview.locator("script"),
      "no script tag may survive sanitizing",
    ).toHaveCount(0)
    expect(
      await preview.locator("*[onerror]").count(),
      "no onerror handler may survive sanitizing",
    ).toBe(0)

    // The runtime sentinel is a SECONDARY check, and its limit is worth writing
    // down rather than trusting: it was originally first, and against that same
    // unsanitized build it read `false` and reported nothing. `<script>` inserted
    // through innerHTML never runs at all, and the `onerror` fires only once the
    // image load has failed — asynchronously — so reading the flag straight after
    // the click races the very thing it is watching for. The wait gives it its
    // chance; the two assertions above are what actually hold the line.
    await page.waitForTimeout(1000)
    expect(
      await page.evaluate(
        () => (window as unknown as { __pwned?: boolean }).__pwned,
      ),
      "the pasted payload must not run in the preview",
    ).toBe(false)

    // Write brings the source back — the tabs pick a pane, they do not commit
    // anything, and the field must still be there to submit.
    await form.getByRole("button", { name: "Write" }).click()
    await expect(form.locator("textarea[name=content]")).toBeVisible()
  })

  // --- complaint 3: the upload button, end to end --------------------------
  test("an admin uploads an image into a platform page and it is readable back", async ({
    page,
    request,
    browser,
  }) => {
    await deletePageIfPresent(page)
    await page.getByRole("button", { name: "New page" }).click()

    const form = createForm(page)
    await form.locator('input[name="slug"]').fill(SLUG)
    await form.locator('input[name="title"]').fill(TITLE)

    const content = form.locator("textarea[name=content]")
    await content.fill("## Our venue\n")
    const before = await content.inputValue()

    // The control is a <label> wrapping a hidden input — a styled button cannot
    // open a file picker — so the input is set directly.
    await form
      .locator("input[type=file]")
      .setInputFiles({ name: "venue-photo.png", mimeType: "image/png", buffer: PNG })

    // The editor's own error line FIRST. Without it the failure reads "the
    // textarea did not change", which is the symptom; the component already
    // knows the cause and puts it on screen.
    //
    // Deliberately UNFILTERED, unlike its siblings in 15/16. Those filter on
    // /upload|store|permission|…/ and this one did too — which hid the first
    // real failure here behind "neither an inserted image nor an error
    // appeared". The message was
    // `validation error: owner_id: value is empty, which is not a valid UUID`,
    // and it matched no word in the list. A filter on an error's WORDING can
    // only recognise the errors somebody already thought of; the editor's alert
    // is the only [role=alert] inside this form, so scoping is enough.
    const uploadError = form.locator("[role=alert]")
    await expect
      .poll(
        async () =>
          (await uploadError.count()) > 0 ||
          (await content.inputValue()) !== before,
        {
          timeout: 20_000,
          message: "neither an inserted image nor an error appeared",
        },
      )
      .toBe(true)
    if (await uploadError.count()) {
      throw new Error(`upload reported: ${await uploadError.first().innerText()}`)
    }

    const value = await content.inputValue()
    const url = value.match(/!\[.*\]\((\/objects\/[^)]+)\)/)?.[1]
    expect(url, "an /objects path should have been inserted").toBeTruthy()
    // Alt text from the filename the person chose: an empty alt on a content
    // image is a hole for anyone using a screen reader.
    expect(value).toContain("venue photo")

    // The key the BACKEND derived. `site/media/` is the whole point of the new
    // upload kind — a platform page has no event to file media under, and
    // borrowing HACKATHON_MEDIA would have needed a hackathon id and an
    // organiser's Write permission that no site page can supply.
    expect(url).toContain("/site/media/")
    expect(url, "a platform page must not file media under an event").not.toContain(
      "/hackathons/",
    )

    // The bytes are really there. Content-Type too: an image stored under the
    // wrong type is one the browser refuses to render, which looks like a
    // broken upload long after the upload succeeded.
    const got = await request.get(url!)
    expect(got.status()).toBe(200)
    // WebP, not PNG: the browser re-encodes before presigning, because size and
    // content type are conditions ON the signature. The converter keeps the
    // original whenever WebP would come out larger, so accept either and assert
    // the stored object is a real image rather than pinning an encoding.
    expect(got.headers()["content-type"]).toMatch(/^image\/(webp|png)$/)
    expect((await got.body()).length).toBeGreaterThan(0)

    // Publish it, and the picture is on the page for the public. Uploading
    // stores the OBJECT; the form is what stores the path — two different acts,
    // and the second is the half that has broken before elsewhere.
    await form.locator('input[name="visible"]').check()
    await form.getByRole("button", { name: "Create page" }).click()
    await expect(page.locator(".card", { hasText: TITLE })).toBeVisible()

    const anon = await anonymousContext(browser)
    const anonPage = await anon.newPage()
    const resp = await anonPage.goto(`/${SLUG}`)
    expect(resp?.status()).toBe(200)
    await expect(
      anonPage.locator(`.markdown-content img[src="${url}"]`),
      "the uploaded image must render on the published page",
    ).toBeVisible()
    await anon.close()

    await deletePageIfPresent(page)
  })

  // --- the authorization rule the new kind added ---------------------------
  //
  // Site pages have no hackathon domain, so SITE_MEDIA authorizes on the GLOBAL
  // Admin role — the same rule every SitePageService mutation uses. Asserted
  // through the presign endpoint directly: a per-hackathon Owner is the exact
  // near-miss that would pass if the kind had reused HACKATHON_MEDIA's check.
  test("only a platform admin may presign a platform-page image", async ({
    page,
    browser,
  }) => {
    const body = {
      filename: "x.png",
      contentType: "image/png",
      sizeBytes: PNG.length,
    }

    // Positive control first. Without it "403 for everybody" — a broken route,
    // a wrong kind, a typo in the path — reads exactly like a working rule.
    await page.goto("/manage/pages")
    const asAdmin = await page.request.post("/manage/pages/media", { data: body })
    expect(asAdmin.status(), await asAdmin.text()).toBe(200)
    const presigned = (await asAdmin.json()) as {
      uploadUrl?: string
      publicUrl?: string
    }
    expect(presigned.uploadUrl).toBeTruthy()
    expect(presigned.publicUrl).toContain("/site/media/")

    // alice owns a hackathon. That is a per-hackathon role and grants nothing
    // here.
    const aliceCtx = await contextFor(browser, PERSONAS.alice.key)
    const asOrganizer = await aliceCtx.request.post("/manage/pages/media", {
      data: body,
    })
    expect(
      asOrganizer.status(),
      "an event organizer is not a platform admin",
    ).toBe(403)
    expect(await asOrganizer.text()).not.toContain("uploadUrl")
    await aliceCtx.close()

    // Anonymous is a different answer from "not you": the (app) guard bounces
    // them to login before the RPC is ever made.
    const anon = await anonymousContext(browser)
    const asAnon = await anon.request.post("/manage/pages/media", {
      data: body,
      maxRedirects: 0,
    })
    expect([302, 303, 401, 403]).toContain(asAnon.status())
    expect(await asAnon.text()).not.toContain("uploadUrl")
    await anon.close()
  })
})

// The SAME fault, away from the page that was reported. `field-area` used to be
// a modifier that drew nothing on its own, and eight textareas across four
// routes carried it alone — /manage/pages was simply the one somebody complained
// about. Mounting MarkdownEditor fixed that page (its textarea spells
// `field field-area`); it did nothing for the other seven, which is why the
// class itself now carries the whole recipe.
//
// This test is what pins that half. It is deliberately on a different route with
// a different persona: without it, reverting the CSS change would leave the
// suite green, because every assertion above is satisfied by the `field` that
// MarkdownEditor adds.
test.describe("textareas elsewhere draw as fields too", () => {
  test.use({ storageState: storageStatePath(PERSONAS.alice.key) })

  test("the email-template message box is a real field", async ({ page }) => {
    const id = await myHackathonId(page, SEED_HACKATHONS.h1.name)
    await page.goto(`/my/hackathon/${id}/email`)
    await page.waitForLoadState("networkidle")

    await expectDrawsAsField(
      page.locator("textarea.field-area").first(),
      "the email template body",
    )
  })
})
