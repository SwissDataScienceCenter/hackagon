import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../helpers/state.js"
import {
  CONSENT_COOKIE,
  bytes,
  captureIngest,
  replayConfig,
  writeCapture,
} from "./capture.js"

/*
 * A browser asking not to be tracked is not recorded, even when it has said
 * yes.
 *
 * Do Not Track here is a REAL Firefox preference, not a stubbed property:
 * `privacy.donottrackheader.enabled` is set at launch, so `navigator.doNotTrack`
 * is "1" for the same reason it would be on a visitor's machine. Stubbing it
 * with an init script would test the stub.
 *
 * Its own FILE and not a describe block inside `consent.spec.ts`: `launchOptions`
 * is a WORKER-scoped fixture, and Playwright refuses `test.use` on one inside a
 * describe group ("it forces a new worker"). File level is where it is allowed.
 *
 * CONSENT IS GRANTED HERE ON PURPOSE. With the ask satisfied, DNT is the only
 * thing left that can suppress recording, so a zero-byte capture can only mean
 * it worked — and the run asserts, positively, that the page really was handed
 * the tracker's configuration, so "nothing was recorded" cannot quietly mean
 * "nothing was ever offered".
 */

const REPLAY = replayConfig()

test.use({
  storageState: storageStatePath("bob"),
  launchOptions: {
    firefoxUserPrefs: { "privacy.donottrackheader.enabled": true },
  },
})

test.describe("Do Not Track", () => {
  test.skip(
    !REPLAY,
    "replay.enabled is not true in the frontend config — bring up .claude/skills/openreplay-stack and wire it first",
  )

  test("suppresses recording even with consent granted", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000)

    await context.addCookies([
      {
        name: CONSENT_COOKIE,
        value: "granted",
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ])

    const trackerRequests: string[] = []
    page.on("request", (r) => {
      if (/openreplay/i.test(r.url())) trackerRequests.push(r.url())
    })
    const cap = captureIngest(page)

    await page.goto("/dashboard")

    // The pref is what this test rests on, so check it took rather than
    // trusting the launch option — a renamed pref would otherwise quietly turn
    // this into a test that DNT-off browsers do not record either.
    expect(
      await page.evaluate(() => navigator.doNotTrack),
      "the browser is not actually sending Do Not Track — the launch pref did not take",
    ).toBe("1")

    // The consent gate is OPEN: the page really was given the tracker's
    // config. Without this the zero below would also be satisfied by the server
    // simply not having sent anything, which is a different mechanism — and it
    // is what makes the "key absent" assertion in consent.spec.ts mean
    // something, since it proves the key is present in the HTML when it should
    // be.
    expect(
      (await page.content()).includes(REPLAY!.projectKey),
      "the page was not given the tracker config, so this run proves nothing about DNT",
    ).toBe(true)

    await page.goto("/account")
    await page.mouse.move(150, 150)
    await page.mouse.click(150, 150)
    await page.waitForTimeout(8_000)

    expect(
      bytes(cap.chunks),
      `${bytes(cap.chunks)} bytes were recorded from a browser sending Do Not Track ` +
        `(see ${writeCapture("dnt", cap.chunks)})`,
    ).toBe(0)

    // ...and the SDK was never even fetched. `respectDoNotTrack` alone would
    // have downloaded the chunk and then declined; SessionReplay.svelte checks
    // first, so a request that is itself a signal about the visitor is never
    // made.
    expect(
      trackerRequests,
      "something was fetched from OpenReplay for a Do Not Track visitor",
    ).toEqual([])
  })
})
