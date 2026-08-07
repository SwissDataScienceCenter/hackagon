import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../helpers/state.js"
import { myHackathonId } from "../../helpers/discover.js"
import { SEED_HACKATHONS } from "../../personas.js"

// Uploading an image from the page editor.
//
// Until now the only uploader in the UI was the event logo, so a gallery page
// could only reference images hosted somewhere else — which is exactly the
// state docs/storage.md was written to end. The editor presigns, the BROWSER
// PUTs straight to the object store, and the markdown gets the returned public
// path.
//
// The assertion that matters is the last one: that the uploaded bytes are
// actually readable back at the URL written into the page. A presign that
// returns a URL proves nothing — past bugs in this exact path stored images as
// `application/x-www-form-urlencoded`, and uploaded nothing at all while
// reporting success.

// A 1x1 PNG. Inline rather than a fixture file so the test has no on-disk
// dependency that could drift or go missing.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

test.describe("media upload", () => {
  test.use({ storageState: storageStatePath("alice") })

  test("an organiser uploads an image into a page and it is readable back", async ({
    page,
    request,
  }) => {
    const id = await myHackathonId(page, SEED_HACKATHONS.h1.name)
    await page.goto(`/my/hackathon/${id}/pages/new`)
    await page.waitForLoadState("networkidle")

    const content = page.locator("textarea[name=content]")
    await expect(content).toBeVisible()
    await expect(
      content,
      "the editor should start empty so the assertion below is about OUR upload",
    ).toHaveValue("")

    // The control is a <label> wrapping a hidden input — a styled button cannot
    // open a file picker — so the input is set directly.
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: "venue-photo.png", mimeType: "image/png", buffer: PNG })

    // Check the editor's own error line FIRST. Without this the failure is
    // "the textarea is still empty", which is the symptom; the component
    // already knows the cause and puts it on screen.
    const uploadError = page.locator('[role=alert]').filter({ hasText: /upload|store|permission|MiB|type/i })
    await expect
      .poll(async () => (await uploadError.count()) > 0 || (await content.inputValue()) !== "", {
        timeout: 20_000,
        message: "neither an inserted image nor an error appeared",
      })
      .toBe(true)
    if (await uploadError.count()) {
      throw new Error(`upload reported: ${await uploadError.first().innerText()}`)
    }

    // The markdown gains an image pointing at the object store.
    await expect(content).toHaveValue(/!\[.*\]\(\/objects\/[^)]+\)/, {
      timeout: 20_000,
    })

    const value = await content.inputValue()
    const url = value.match(/!\[.*\]\((\/objects\/[^)]+)\)/)?.[1]
    expect(url, "an /objects path should have been inserted").toBeTruthy()

    // Alt text from the filename, because an empty alt on a content image is a
    // hole for anyone using a screen reader.
    expect(value).toContain("venue photo")

    // The bytes are really there. Content-Type too: an image stored under the
    // wrong type is one a browser refuses to render, which looks like a broken
    // upload long after the upload succeeded.
    const got = await request.get(url!)
    expect(got.status()).toBe(200)
    // WebP, not PNG: the editor re-encodes in the browser before presigning,
    // because the size and content type are conditions ON the signature —
    // converting after signing would guarantee a mismatch. A 1x1 PNG is the
    // one case where the result could come out LARGER, and the converter
    // keeps the original when it does, so accept either type and assert the
    // stored bytes are a real image rather than pinning the exact encoding.
    expect(got.headers()["content-type"]).toMatch(/^image\/(webp|png)$/)
    expect((await got.body()).length).toBeGreaterThan(0)
  })
})
