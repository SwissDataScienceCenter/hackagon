import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../helpers/state.js"
import { myHackathonId } from "../../helpers/discover.js"
import { generateLogoPng } from "../../helpers/files.js"
import { SEED_HACKATHONS } from "../../personas.js"

// The two uploaders a person meets first: their own profile picture, and the
// event logo.
//
// Both surfaces existed before this suite and neither worked as a person would
// find it. The account page said, in so many words, "a link, not an upload —
// there is no file storage yet", months after the store landed. The event logo
// DID have an uploader — a bare `<input type=file>` tucked under a full-width
// URL box, which organisers read as "there is only a URL field". So these tests
// assert two different things: that the control is reachable, and that the
// bytes are really there afterwards.
//
// RE-SPECIFIED when the picker dialog landed. The file input is no longer on
// the page: `ImageUploadField` now renders ONE button that opens a modal with
// two ways in — upload (with drag and drop) and, where a listing scope exists,
// whatever is already stored. So each test opens the dialog first. That extra
// click is the point of the change and not overhead: the whole reason for the
// dialog is that a bare file input could only ever offer one of those two.
//
// The last assertion in each test is the one that matters. A presign returning
// a URL proves nothing — this exact path has previously stored images as
// `application/x-www-form-urlencoded`, and uploaded nothing at all while
// reporting success. So each test READS THE STORED URL BACK and checks the
// status and the Content-Type.

/** Deterministic 96x96 PNG. Same bytes on every machine, every run. */
const PNG = generateLogoPng(4711)

/** An /objects path, not an http URL: the DB stores a path, never a presign. */
const STORED_PATH = /^\/objects\/\S+$/

test.describe("profile picture", () => {
  // Bob is a plain Member. Deliberate: an avatar is the one upload with no
  // hackathon to scope a permission to, so it authorizes on identity — and
  // "you, or a global admin" has to include somebody with no roles at all.
  test.use({ storageState: storageStatePath("bob") })

  test("bob uploads a profile picture and it is readable back", async ({
    page,
    request,
  }) => {
    await page.goto("/account")

    const field = page.getByLabel("Profile picture")
    await expect(field).toBeVisible()

    // Against the value that is there BEFORE, never against the shape of a
    // stored path. A --no-reset rerun starts with the picture the last run
    // saved, so "the field matches /^\/objects\//" is already true and this
    // test would capture the OLD path, save the NEW one, and fail comparing
    // them — which is exactly how it failed the first time it was re-run.
    const before = await field.inputValue()

    // One button opens the picker. Clicked, not `goto`-ed past: a control that
    // renders is not the same claim as a control you can reach, which is the
    // lesson the account menu taught this suite.
    await page.getByRole("button", { name: "Upload a picture" }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    // Upload-only here, and deliberately: NO listing scope covers
    // `users/<id>/avatar/`, because that prefix is other people's faces. So the
    // gallery half must NOT be offered — asserted alongside the positive below,
    // since "no gallery tab" also passes on a dialog that failed to render.
    await expect(
      dialog.getByRole("button", { name: "Choose from gallery" }),
    ).toHaveCount(0)
    await expect(
      dialog.getByRole("region", { name: /drop an image here/i }),
    ).toBeVisible()

    // The control inside the dialog is a <label> wrapping a hidden input — a
    // styled button cannot open a file picker — so the input is set directly.
    // Its accessible name deliberately shares no words with "Profile picture":
    // a page-wide getByLabel would otherwise match the file control too and the
    // field above would stop being addressable.
    await page
      .getByLabel("Choose an image file for your account")
      .setInputFiles({
        name: "bob-face.png",
        mimeType: "image/png",
        buffer: PNG,
      })

    // Check the uploader's own error line FIRST. Without this the failure is
    // "the field did not change", which is the symptom; the component already
    // knows the cause and puts it on screen.
    const uploadError = page
      .locator("[role=alert]")
      .filter({ hasText: /upload|storage|permission|bytes|type/i })
    await expect
      .poll(
        async () =>
          (await uploadError.count()) > 0 ||
          (await field.inputValue()) !== before,
        {
          timeout: 20_000,
          message: "neither a new stored path nor an error appeared",
        },
      )
      .toBe(true)
    if (await uploadError.count()) {
      throw new Error(
        `upload reported: ${await uploadError.first().innerText()}`,
      )
    }

    const stored = await field.inputValue()
    expect(stored).toMatch(STORED_PATH)
    expect(stored).not.toBe(before)
    // Filed under this person's own prefix — which is what makes
    // DeleteAccount's purge complete without a manifest.
    expect(stored).toContain("/users/")
    expect(stored).toContain("/avatar/")

    // Saving it is a separate act, and it is the half that used to fail:
    // EditProfile validated avatar_url as http/https ONLY, so the upload
    // succeeded, the bytes were stored, and saving the path came back
    // INVALID_ARGUMENT. Reloading proves it reached the database.
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect(page.getByText("Saved.")).toBeVisible()
    await page.reload()
    await expect(page.getByLabel("Profile picture")).toHaveValue(stored)

    // It is his PICTURE now, not just a string in a field.
    await expect(page.locator(`img[src="${stored}"]`).first()).toBeVisible()

    // And the bytes are really there. Content-Type too: an image stored under
    // the wrong type is one a browser refuses to render, which looks like a
    // broken upload long after the upload succeeded.
    const got = await request.get(stored)
    expect(got.status()).toBe(200)
    // WebP, not PNG: the browser re-encodes before presigning, because the
    // size and content type are conditions ON the signature. The converter
    // keeps the original whenever WebP would come out larger, so accept either
    // and assert the stored object is a real image rather than pinning an
    // encoding.
    expect(got.headers()["content-type"]).toMatch(/^image\/(webp|png)$/)
    expect((await got.body()).length).toBeGreaterThan(0)
  })
})

test.describe("event logo", () => {
  test.use({ storageState: storageStatePath("alice") })

  test("an organiser uploads a logo, saves it, and it is readable back", async ({
    page,
    request,
  }) => {
    const id = await myHackathonId(page, SEED_HACKATHONS.h1.name)
    await page.goto(`/my/hackathon/${id}/manage/edit`)

    const field = page.getByLabel("Logo (optional)")
    await expect(field).toBeVisible()

    // The seed already gives every event a cover, so "the field holds an
    // /objects path" would pass without this test doing anything. Everything
    // below is stated against the value that was there BEFORE.
    const before = await field.inputValue()

    await page.getByRole("button", { name: "Choose a logo" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    // This surface DOES have a listing scope — an event's own media — so both
    // ways in are on offer. Its own test is below; here it is the control that
    // proves the avatar dialog's missing tab above is a decision and not a
    // dialog that simply never renders one.
    await expect(
      dialog.getByRole("button", { name: "Choose from gallery" }),
    ).toBeVisible()

    const filePicker = page.getByLabel(
      "Choose an image file for the event logo",
    )

    // First, the refusal — and that it happens BEFORE any transfer. Size and
    // content type are conditions on the presign, so a PDF is turned away by
    // the backend at the signing step rather than stored and discovered later.
    await filePicker.setInputFiles({
      name: "not-an-image.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 not really"),
    })
    await expect(
      page.locator("[role=alert]").filter({ hasText: /content type/i }),
    ).toBeVisible({ timeout: 20_000 })
    await expect(
      field,
      "a refused file must not change the stored value",
    ).toHaveValue(before)

    // Now a real one.
    await filePicker.setInputFiles({
      name: "event-logo.png",
      mimeType: "image/png",
      buffer: PNG,
    })
    await expect(field).not.toHaveValue(before, { timeout: 20_000 })

    const stored = await field.inputValue()
    expect(stored).toMatch(STORED_PATH)
    // The key the backend derived, from the id in the path — not the seed's.
    expect(stored).toContain(`/hackathons/${id}/logo/`)

    // Uploading stores the object; the form is what stores the PATH. Saving
    // redirects to Manage Hackathon — the page this form is reached from, and no
    // longer the dashboard — so come back and read it off the form.
    await page.getByRole("button", { name: "Save changes" }).click()
    await page.waitForURL(`**/my/hackathon/${id}/manage`)
    await page.goto(`/my/hackathon/${id}/manage/edit`)
    await expect(page.getByLabel("Logo (optional)")).toHaveValue(stored)
    await expect(page.locator(`img[src="${stored}"]`).first()).toBeVisible()

    const got = await request.get(stored)
    expect(got.status()).toBe(200)
    expect(got.headers()["content-type"]).toMatch(/^image\/(webp|png)$/)
    expect((await got.body()).length).toBeGreaterThan(0)
  })
})
