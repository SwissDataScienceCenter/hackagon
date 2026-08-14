import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../helpers/state.js"
import { contextFor } from "../../helpers/login.js"
import { myHackathonId } from "../../helpers/discover.js"
import { generateLogoPng } from "../../helpers/files.js"
import { SEED_HACKATHONS } from "../../personas.js"

// Listing what is already uploaded: the platform media library at
// /manage/gallery, and the "choose from gallery" half of the picker dialog.
//
// Both rest on one backend rule, and the rule is what this file is really
// about: **you may LIST a prefix exactly when you may WRITE to it.** So the
// tests come in pairs — the caller who may see the files does, and the caller
// who may not is refused, with the right status code. A refusal on its own
// proves nothing; a handler that denied everybody would pass half of this file.
//
// Two prefixes are listable by nobody, and the assertions about them carry a
// POSITIVE control in the same test. "The gallery shows no avatars" is true of a
// gallery showing nothing at all, so every one of those checks also names
// something the gallery DOES show.

/** Deterministic 96x96 PNG. Same bytes on every machine, every run. */
const PNG = generateLogoPng(9002)

test.describe("the platform media library", () => {
  test.use({ storageState: storageStatePath("admin") })

  test("an admin reaches it from the dashboard and sees what each picture is", async ({
    page,
  }) => {
    // CLICKED, not `goto`-ed. `/manage/pages` shipped reachable only by typing
    // its URL and nobody noticed for weeks, because every test reached it with
    // page.goto — which proves the route works and not that you can get there.
    await page.goto("/dashboard")
    const platform = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Manage platform" }) })
    await expect(platform).toBeVisible()
    await platform.getByRole("link", { name: /^Media/ }).click()

    await expect(page).toHaveURL(/\/manage\/gallery/)
    await expect(
      page.getByRole("heading", { name: "Media library" }),
    ).toBeVisible()

    // The store is seeded with three event covers by .devcontainer/rustfs-init.sh
    // before anything else runs, so there is always something to list. If this
    // is empty the listing is broken, not the fixture.
    const tiles = page.locator("li img")
    await expect(tiles.first()).toBeVisible()
    expect(await tiles.count()).toBeGreaterThan(0)

    // The element that STATES the fact, not the card that contains the word.
    // The card also holds the alt text and the link, so asserting on it would
    // pass on a tile whose own label line was blank.
    const origins = page.getByTestId("image-origin")
    expect(await origins.count()).toBeGreaterThan(0)
    const labels = await origins.allInnerTexts()
    expect(
      labels.some((l) =>
        /Event (logo|image)|Seeded cover|Platform page/.test(l),
      ),
      `no tile said where it came from; got ${JSON.stringify(labels)}`,
    ).toBe(true)
  })

  test("it lists event and platform imagery, and no profile pictures at all", async ({
    page,
    browser,
    request,
  }) => {
    // THE POSITIVE CONTROL FIRST: put an avatar in the store as bob, so the
    // absence asserted below is an absence of something that exists. Without
    // this the check agrees with a gallery that lists nothing.
    //
    // contextFor(), never browser.newContext(): a bare newContext inside a
    // describe with storageState inherits it, so "as bob" would arrive as the
    // admin. That exact bug was found in this suite.
    const bobContext = await contextFor(browser, "bob")
    const bobPage = await bobContext.newPage()
    let avatarPath: string
    try {
      await bobPage.goto("/account")
      const field = bobPage.getByLabel("Profile picture")
      const before = await field.inputValue()
      await bobPage.getByRole("button", { name: "Upload a picture" }).click()
      await bobPage
        .getByLabel("Choose an image file for your account")
        .setInputFiles({
          name: "bob-gallery.png",
          mimeType: "image/png",
          buffer: PNG,
        })
      await expect(field).not.toHaveValue(before, { timeout: 20_000 })
      avatarPath = await field.inputValue()
    } finally {
      await bobContext.close()
    }
    expect(avatarPath).toContain("/users/")
    expect(avatarPath).toContain("/avatar/")
    // It really is in the store — so "the gallery does not show it" is a claim
    // about the listing rule and not about a failed upload.
    expect((await request.get(avatarPath)).status()).toBe(200)

    // Now the library, read through the endpoint the page and the picker share.
    const listing = await page.request.get("/manage/gallery/media?pageSize=200")
    expect(listing.status()).toBe(200)
    const body = (await listing.json()) as {
      objects: { key: string; url: string }[]
    }

    // Positive: it lists the prefixes it is supposed to.
    expect(
      body.objects.length,
      "the library should list the seeded event covers",
    ).toBeGreaterThan(0)
    expect(
      body.objects.some((o) => o.key.startsWith("hackathons/")),
      `no event imagery listed; got ${JSON.stringify(body.objects.map((o) => o.key))}`,
    ).toBe(true)

    // Negative: not one avatar, not the one just uploaded, not any other.
    expect(body.objects.filter((o) => o.key.startsWith("users/"))).toEqual([])
    expect(body.objects.map((o) => o.url)).not.toContain(avatarPath)
    // Nor a private submission attachment, whose keys would say which teams
    // turned work in even if the objects themselves stayed unreadable.
    expect(body.objects.filter((o) => o.key.startsWith("teams/"))).toEqual([])

    // Every url is a stable stored PATH, never a presigned one. A presign
    // expires and is a bearer credential; a wall of them would start lapsing
    // while the grid was still on screen.
    for (const object of body.objects) {
      expect(object.url).toMatch(/^\/objects\//)
      expect(object.url).not.toContain("X-Amz-Signature")
    }
  })

  test("paging is a real URL, and the page says what it is not showing", async ({
    page,
  }) => {
    await page.goto("/manage/gallery")
    // Stated on screen rather than left to be inferred: this page is not an
    // inventory of the bucket, and reading it as one would be wrong.
    await expect(
      page.getByText(
        /Profile pictures and team submission files are deliberately not listed/i,
      ),
    ).toBeVisible()
    await expect(page.getByText(/There is also no delete/i)).toBeVisible()

    // One page holds 120 and the fixture has far fewer, so there is no next
    // link to follow. Assert the SHAPE instead: a token, when there is one,
    // must be a link with the token in its href — because a fetch-driven
    // "load more" would not survive a reload and this one has to.
    const older = page.getByRole("link", { name: "Older images" })
    if (await older.count()) {
      await expect(older).toHaveAttribute("href", /\/manage\/gallery\?page=\d+/)
    }
  })
})

test.describe("who may list what", () => {
  test.use({ storageState: storageStatePath("alice") })

  test("an organiser is refused the platform library but sees their own event's", async ({
    page,
  }) => {
    // Alice is a hackathon organiser and owns h1. She may not read every
    // event's files — that scope takes the global Admin role.
    const denied = await page.request.get("/manage/gallery/media")
    expect(denied.status()).toBe(403)

    const deniedPage = await page.request.get("/manage/gallery")
    expect(deniedPage.status()).toBe(403)

    // THE POSITIVE CONTROL, same caller, same test: she is not powerless. Her
    // own event's media is exactly the prefix she may write to, so it is
    // exactly the prefix she may list.
    const id = await myHackathonId(page, SEED_HACKATHONS.h1.name)
    const own = await page.request.get(`/my/hackathon/${id}/media?pageSize=200`)
    expect(own.status()).toBe(200)
    const body = (await own.json()) as { objects: { key: string }[] }
    // Everything returned is under HER event and nothing else's.
    for (const object of body.objects) {
      expect(object.key.startsWith(`hackathons/${id}/`)).toBe(true)
    }
  })

  test("she picks an already-uploaded image as the event logo", async ({
    page,
    request,
  }) => {
    const id = await myHackathonId(page, SEED_HACKATHONS.h1.name)

    // Make sure the event HAS media to choose from — otherwise the gallery tab
    // would legitimately be empty and this test would prove nothing. Uploading
    // it through the same dialog is also the (a) half of the feature: the
    // upload path and the reuse path are one control.
    await page.goto(`/my/hackathon/${id}/manage/edit`)
    const field = page.getByLabel("Logo (optional)")
    await expect(field).toBeVisible()

    await page.getByRole("button", { name: "Choose a logo" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await page
      .getByLabel("Choose an image file for the event logo")
      .setInputFiles({
        name: "reusable-mark.png",
        mimeType: "image/png",
        buffer: PNG,
      })
    await expect(dialog).toBeHidden({ timeout: 20_000 })
    const uploaded = await field.inputValue()
    expect(uploaded).toMatch(/^\/objects\//)

    // Clear the field, so what follows cannot be the value the upload left.
    await page.getByRole("button", { name: "Remove" }).first().click()
    await expect(field).toHaveValue("")

    // Now the second way in: choose from what is already stored.
    await page.getByRole("button", { name: "Choose a logo" }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole("button", { name: "Choose from gallery" }).click()

    const tiles = dialog.getByRole("button", { name: /Use this image/ })
    await expect(tiles.first()).toBeVisible({ timeout: 20_000 })
    await tiles.first().click()

    // The dialog closes and the field holds a stored path — a different act
    // from the upload above, and the field was empty a moment ago.
    await expect(dialog).toBeHidden()
    const chosen = await field.inputValue()
    expect(chosen).toMatch(/^\/objects\/\S+$/)
    expect(chosen).toContain(`/hackathons/${id}/`)

    // And it is a real image, not just a plausible string: the whole reason
    // this listing exists is to hand back something that renders.
    const got = await request.get(chosen)
    expect(got.status()).toBe(200)
    expect(got.headers()["content-type"]).toMatch(
      /^image\/(webp|png|jpeg|gif)$/,
    )
    expect((await got.body()).length).toBeGreaterThan(0)
    // The FIELD's preview, addressed by its own alt text — not
    // `img[src=…].first()`, which matched the dialog's (now hidden) thumbnail
    // of the very same object and reported "hidden" for a picture that was on
    // screen. Assert on the element that states the fact.
    await expect(page.getByAltText("Current logo")).toHaveAttribute(
      "src",
      chosen,
    )
  })
})

test.describe("the picker dialog itself", () => {
  test.use({ storageState: storageStatePath("alice") })

  test("a dropped file uploads, and the drop target says it is armed", async ({
    page,
  }) => {
    // Drag and drop is the half of this feature that did not exist before, and
    // it is the half no other test can reach: `setInputFiles` drives the file
    // INPUT and never runs the drop handler. So the events are synthesised in
    // the page — a real File, a real DataTransfer, real DragEvents — which is as
    // close to a human dragging a photograph in as a browser automation gets.
    const id = await myHackathonId(page, SEED_HACKATHONS.h1.name)
    await page.goto(`/my/hackathon/${id}/manage/edit`)

    const field = page.getByLabel("Logo (optional)")
    const before = await field.inputValue()

    await page.getByRole("button", { name: "Choose a logo" }).click()
    const zone = page.getByRole("region", { name: /drop an image here/i })
    await expect(zone).toBeVisible()

    // The border colour is the only thing that tells a person the box will
    // accept what they are holding, and it is driven by a dragenter counter that
    // a single boolean got wrong (it flickered off over the button inside).
    const armedBefore = await zone.evaluate((el) => el.className)
    await zone.dispatchEvent("dragenter", {
      dataTransfer: await page.evaluateHandle(() => new DataTransfer()),
    })
    await expect
      .poll(
        async () => (await zone.evaluate((el) => el.className)) !== armedBefore,
        {
          timeout: 5_000,
          message: "the drop target never showed that it was armed",
        },
      )
      .toBe(true)

    // Now the drop. The file is built in page context because a File cannot
    // cross the Playwright boundary; the bytes are a real 1x1 PNG.
    const dropped = await page.evaluateHandle(() => {
      const base64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const file = new File([bytes], "dragged-in.png", { type: "image/png" })
      const dt = new DataTransfer()
      dt.items.add(file)
      return dt
    })
    await zone.dispatchEvent("drop", { dataTransfer: dropped })

    // The upload really happened: the dialog closed itself and the field holds a
    // path under THIS event's prefix that was not there before.
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 })
    const stored = await field.inputValue()
    expect(stored).not.toBe(before)
    expect(stored).toMatch(/^\/objects\/\S+$/)
    expect(stored).toContain(`/hackathons/${id}/`)
  })

  test("Escape closes it and nothing is chosen", async ({ page }) => {
    // A modal that can only be dismissed with a pointer is a trap. This is the
    // platform's own behaviour — `showModal()` handles Esc, which is most of why
    // a native <dialog> was chosen over a div — so the assertion is that the
    // component does not get in its way, and that dismissing changes nothing.
    const id = await myHackathonId(page, SEED_HACKATHONS.h1.name)
    await page.goto(`/my/hackathon/${id}/manage/edit`)

    const field = page.getByLabel("Logo (optional)")
    const before = await field.inputValue()

    const open = page.getByRole("button", { name: "Choose a logo" })
    await open.click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()

    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(field).toHaveValue(before)

    // And it reopens — the positive control. A dialog that closed by being
    // destroyed would pass the assertion above and never come back.
    await open.click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
  })
})

test.describe("a plain member", () => {
  test.use({ storageState: storageStatePath("bob") })

  test("cannot list an event's media, and is told denied rather than not-found", async ({
    page,
  }) => {
    // Reading an event is not seeing the drawer it keeps its pictures in:
    // listing is authorized as `hackathon:write`, the permission that put the
    // files there. 403 and not 404 — the event's existence is not a secret,
    // his permission to browse its files is what is missing.
    const id = await myHackathonId(page, SEED_HACKATHONS.h1.name)
    const denied = await page.request.get(`/my/hackathon/${id}/media`)
    expect(denied.status()).toBe(403)

    // The positive control: bob is a real signed-in user whose requests
    // otherwise succeed, so the 403 above is about this prefix and not about a
    // broken session.
    const ok = await page.request.get("/account")
    expect(ok.status()).toBe(200)
  })
})
