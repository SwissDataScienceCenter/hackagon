import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../helpers/state.js"
import {
  CONSENT_COOKIE,
  bytes,
  captureIngest,
  contains,
  replayConfig,
  writeCapture,
} from "./capture.js"

/*
 * Nobody is recorded who did not say yes.
 *
 * `masking.spec.ts` proves that what IS recorded is masked. This file proves
 * the prior question: that a recording happens at all only on the visitor's
 * say-so, and that withdrawing stops it. `dnt.spec.ts` covers the browser that
 * has said yes but is sending Do Not Track (its own file, because the launch
 * preference it needs is a worker-scoped fixture).
 *
 * THE EVIDENCE IS BYTES ON THE WIRE, NOT AN ASSERTION ABOUT A FLAG. Every test
 * here counts the bytes the page posted to the ingest endpoint. "The component
 * checked a variable" is a statement about our code; "nothing left the
 * browser" is a statement about the visitor, and only the second one is worth
 * making.
 *
 * The shape of the file guards against the failure mode this repo keeps
 * finding: a zero-byte capture reads identically whether recording was
 * suppressed or the measurement was broken. So the first test does BOTH halves
 * — no consent (expect zero), then consent through the real banner (expect
 * non-zero) — in one browser context against one interception. That non-zero
 * half is what licenses every zero elsewhere in this file.
 *
 * Needs `replay.enabled: true` in the frontend config pointed at a live
 * OpenReplay (`.claude/skills/openreplay-stack`); self-skips otherwise.
 */

const REPLAY = replayConfig()

/** How long to wait before concluding that nothing is being recorded. */
const SILENCE_MS = 8_000

/** The consent cookie, as a browser would hold it. */
const grantedCookie = {
  name: CONSENT_COOKIE,
  value: "granted",
  domain: "localhost",
  path: "/",
  httpOnly: true,
  sameSite: "Lax" as const,
}

test.describe("session replay consent", () => {
  test.skip(
    !REPLAY,
    "replay.enabled is not true in the frontend config — bring up .claude/skills/openreplay-stack and wire it first",
  )
  test.describe.configure({ mode: "serial" })

  test("records nothing until the banner is answered, and records once it is", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000)

    // A visitor who has never been here: no cookie, so no decision exists.
    // This is the very first page load, which is where "default to not
    // recording" has to hold — not "start, then stop if they decline".
    await context.clearCookies()
    const cap = captureIngest(page)

    await page.goto("/")
    await expect(
      page.getByRole("region", { name: "Session recording" }),
    ).toBeVisible()

    // Move around like a person would. The tracker boots from an idle callback
    // after first paint, so this is well past the point at which it would have
    // started had it been given anything to start with.
    await page.goto("/hackathon")
    await page.mouse.move(200, 200)
    await page.mouse.click(200, 200)
    await page.waitForTimeout(SILENCE_MS)

    expect(
      bytes(cap.chunks),
      `${bytes(cap.chunks)} bytes reached the ingest endpoint before anyone consented ` +
        `(see ${writeCapture("no-consent", cap.chunks)})`,
    ).toBe(0)

    // The server never even told the browser where to send anything. Checked
    // separately from the byte count because it is the STRUCTURAL claim: not
    // "the tracker chose not to start" but "there was nothing to start with".
    // Its counterpart — that this key IS in the HTML once consent exists — is
    // asserted in `dnt.spec.ts`, so this cannot pass by the key simply never
    // appearing in a page at all.
    expect(
      (await page.content()).includes(REPLAY!.projectKey),
      "the page was served the tracker's project key despite no consent",
    ).toBe(false)

    // Now say yes, through the actual banner. It is a plain form POST, so this
    // also pins that the decision does not depend on hydration having run.
    await page.getByRole("button", { name: "Allow recording" }).click()
    await expect(
      page.getByRole("region", { name: "Session recording" }),
    ).toBeHidden()

    // ...and the recording starts. Without this half the zero above would be
    // unfalsifiable: it would read the same if the interception were broken,
    // or the stack were down, or the page had never loaded.
    await expect
      .poll(() => bytes(cap.chunks), {
        message:
          "consent was given and still nothing was recorded — is the OpenReplay stack up and the ingestPoint current?",
        timeout: 30_000,
      })
      .toBeGreaterThan(0)

    writeCapture("consented", cap.chunks)
  })

  test("the decision is not writable from page scripts", async ({
    page,
    context,
  }) => {
    await context.clearCookies()
    await page.goto("/")
    await page.getByRole("button", { name: "Allow recording" }).click()

    // httpOnly: a script on the page — ours, or one that got there — must not
    // be able to read the decision, and must not be able to grant itself
    // permission to record by writing it.
    expect(
      await page.evaluate(() => document.cookie),
      "the replay consent cookie is reachable from JavaScript — it must be httpOnly",
    ).not.toContain(CONSENT_COOKIE)

    const cap = captureIngest(page)
    await page.goto("/hackathon")
    await page.waitForTimeout(3_000)
    expect(
      contains(cap.chunks, CONSENT_COOKIE),
      "the consent cookie was transmitted to the replay service",
    ).toBe(false)
  })

  test.describe("withdrawing", () => {
    test.use({ storageState: storageStatePath("bob") })

    test("stops the recording, from /account", async ({ page, context }) => {
      test.setTimeout(120_000)

      // Start from consented: this test is about withdrawal, and granting is
      // already proved end to end above.
      await context.addCookies([grantedCookie])

      const cap = captureIngest(page)
      await page.goto("/account")

      await expect
        .poll(() => bytes(cap.chunks), {
          message: "consented, but nothing was recorded — there is nothing to withdraw",
          timeout: 30_000,
        })
        .toBeGreaterThan(0)

      await expect(page.getByTestId("replay-consent-state")).toContainText(
        "Recording is on",
      )

      await page
        .getByRole("button", { name: "Stop recording this browser" })
        .click()
      await expect(page.getByTestId("replay-consent-state")).toContainText(
        "Recording is off",
      )

      // Everything from here on must be silence. The baseline is taken AFTER
      // the page has settled: the withdrawal navigates, and the tracker is
      // allowed to finish flushing the batch it was holding when the click
      // landed. Stopping may finish; starting again may not.
      await page.waitForTimeout(2_000)
      const settled = bytes(cap.chunks)

      await page.goto("/dashboard")
      await page.mouse.move(300, 300)
      await page.mouse.click(300, 300)
      await page.goto("/account")
      await page.waitForTimeout(SILENCE_MS)

      expect(
        bytes(cap.chunks) - settled,
        `${bytes(cap.chunks) - settled} bytes were recorded AFTER consent was withdrawn ` +
          `(see ${writeCapture("withdrawn", cap.chunks)})`,
      ).toBe(0)
    })
  })
})
