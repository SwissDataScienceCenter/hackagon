import fs from "node:fs"
import path from "node:path"
import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../helpers/state.js"
import { rpcAs, rpcAnonymous } from "../../helpers/api.js"
import { SEED_HACKATHONS } from "../../personas.js"
import {
  FRONTEND,
  bytes,
  captureIngest,
  contains,
  grantConsent,
  replayConfig,
  writeCapture,
} from "./capture.js"

/*
 * Does OpenReplay capture what people type into the registration form?
 *
 * The tracker records the DOM, and its shipped default records input values
 * and page text VERBATIM — masking is opt-in per field. On this app that
 * default would capture dietary requirements, accessibility needs and
 * affiliations, which is exactly what the backend RPC journal's allowlist
 * exists to keep off disk. `SessionReplay.svelte` therefore configures
 * default-deny masking; this spec is the proof that the configuration works,
 * because "we set the option" is not evidence.
 *
 * THE TRAP THIS SPEC IS BUILT AROUND. A grep for a sentinel returning zero
 * hits proves nothing on its own: it reads identically whether the string was
 * masked, or nothing was ever captured, or the payload is compressed, or the
 * interception missed the tracker's requests entirely. So the run that
 * matters is preceded by a CONTROL run over the same interception, on the
 * same origin, against the same ingest endpoint, with masking deliberately
 * OFF. If the control's sentinel is found and the real one is not, the
 * difference is the masking and nothing else.
 *
 * The control does NOT weaken the app: it loads the tracker itself, into a
 * throwaway page fulfilled by `page.route` on the app's origin, and the
 * production component is never given an "unmask" switch to forget about.
 *
 * CONSENT IS A PRECONDITION HERE, NOT THE SUBJECT. Recording now requires the
 * visitor's say-so (`consent.spec.ts` is where that is proved), so every test
 * below that needs a running tracker grants it first. Without that these tests
 * would pass for the worst possible reason — nothing recorded, so nothing
 * leaked — which is the exact false green the control exists to rule out.
 *
 * Needs `replay.enabled: true` in the frontend config pointed at a live
 * OpenReplay (`.claude/skills/openreplay-stack`); it self-skips otherwise, so
 * it never runs as part of smoke or journey.
 */

/** Typed into the real registration form. Must NEVER reach the wire. */
const SENTINEL = "ZZQX-SENTINEL-7731"
/** Typed into the unmasked control page. MUST reach the wire. */
const CONTROL_SENTINEL = "ZZQX-CONTROL-4409"

const REPLAY = replayConfig()

test.describe("OpenReplay masking", () => {
  test.skip(
    !REPLAY,
    "replay.enabled is not true in the frontend config — bring up .claude/skills/openreplay-stack and wire it first",
  )
  test.describe.configure({ mode: "serial" })

  test("CONTROL: an unmasked tracker does put typed text on the wire", async ({
    page,
  }) => {
    test.setTimeout(120_000)

    // The tracker's own ESM bundle, injected into the page. Same library, same
    // version, same ingest — only the options differ.
    const trackerSrc = fs.readFileSync(
      path.join(
        FRONTEND,
        "node_modules/@openreplay/tracker/dist/lib/index.js",
      ),
      "utf8",
    )

    // A throwaway page on the APP'S OWN ORIGIN. Origin matters: the tracker
    // keeps its session in localStorage, so a data: or about:blank page would
    // fail for a reason that has nothing to do with masking.
    await page.route("**/__replay_control__", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <input id="free-text" name="field:diet" />
        </body></html>`,
      }),
    )

    const cap = captureIngest(page)
    await page.goto("/__replay_control__")

    await page.evaluate(
      async ([src, key, ingest]) => {
        const blob = new Blob([src], { type: "text/javascript" })
        const mod = await import(/* @vite-ignore */ URL.createObjectURL(blob))
        const t = new mod.default({
          projectKey: key,
          ingestPoint: ingest,
          __DISABLE_SECURE_MODE: true,
          // Masking OFF, on purpose and only here.
          privateMode: false,
          defaultInputMode: 0, // InputMode.Plain
          obscureInputNumbers: false,
          obscureInputEmails: false,
          obscureInputDates: false,
          obscureTextNumbers: false,
          obscureTextEmails: false,
        })
        await t.start()
        ;(window as unknown as { __t: unknown }).__t = t
      },
      [trackerSrc, REPLAY!.projectKey, REPLAY!.ingestPoint] as const,
    )

    await page.locator("#free-text").fill(CONTROL_SENTINEL)
    await page.locator("#free-text").blur()
    // Batches commit on a ~30ms ticker; give the flush room, then force it.
    await page.waitForTimeout(3_000)
    await page.evaluate(() =>
      (
        window as unknown as { __t: { forceFlushBatch: () => void } }
      ).__t.forceFlushBatch(),
    )
    await page.waitForTimeout(3_000)

    const file = writeCapture("control", cap.chunks)
    console.log(`control capture: ${bytes(cap.chunks)} bytes -> ${file}`)

    // Without this the whole spec is theatre: it proves the interception sees
    // the tracker's traffic AND that a plain ASCII string survives readable in
    // it, so a later zero-hit grep means masking and not measurement failure.
    expect(
      bytes(cap.chunks),
      "the control run captured no ingest traffic at all",
    ).toBeGreaterThan(0)
    expect(
      contains(cap.chunks, CONTROL_SENTINEL),
      "an UNMASKED tracker did not transmit the typed text — the capture method is broken, not the masking",
    ).toBe(true)

    // The control also demonstrates the URL leak the production component
    // closes: with default options the tracker stamps the FULL page URL onto
    // every URL-based DOM message as its base href. Asserting it here is what
    // makes the "no path" assertion in the masked run below mean "we closed
    // it" rather than "this tracker never sent paths anyway".
    expect(
      contains(cap.chunks, "/__replay_control__"),
      "the unmasked control did not transmit the page path — the URL assertions below would prove nothing",
    ).toBe(true)
  })

  test.describe("the real registration form", () => {
    test.use({ storageState: storageStatePath("bob") })

    test("does not transmit what was typed into it", async ({
      page,
      context,
      baseURL,
    }) => {
      test.setTimeout(120_000)

      // The seed fixture defines no registration form, so give h1 one. `diet`
      // is the field the redaction policy is written for.
      const listed = rpcAnonymous("hackathon.HackathonService/List", {
        visibilityFilter: 1,
      })
      expect(listed.ok, listed.raw).toBe(true)
      const h1 = (
        listed.data.hackathons as { id: string; name: string }[]
      ).find((h) => h.name === SEED_HACKATHONS.h1.name)
      expect(h1, "seed hackathon h1 not found — did `just db::seed` run?").toBeTruthy()

      const set = await rpcAs("alice", "hackathon.ConfigService/SetRegistrationForm", {
        hackathonId: h1!.id,
        fields: [
          { key: "diet", label: "Dietary requirements", type: "text", required: false },
        ],
        consents: [{ key: "conduct", label: "I accept the Code of Conduct", required: true }],
      })
      expect(set.ok, set.raw).toBe(true)

      // Recording is opt-in now. Grant it, or the tracker never starts and
      // every assertion below passes because nothing was captured.
      await grantConsent(context, baseURL ?? "http://localhost:8081")

      const cap = captureIngest(page)

      await page.goto(`/register/${h1!.id}`)
      await expect(
        page.getByRole("heading", { name: /Registration|Your registration/ }),
      ).toBeVisible()

      // WAIT FOR RECORDING BEFORE TYPING. The tracker boots from an idle
      // callback, so typing straight after load races it — and the first
      // version of this test lost that race every time: it typed, submitted,
      // and the tracker's first DOM snapshot was of the "thanks, your answers
      // are in" screen. The form, the input and the sentinel were never in the
      // captured DOM at all, so "sentinel absent" was true for the one reason
      // that proves nothing. Nothing in the output said so.
      await expect
        .poll(() => cap.chunks.length, {
          message:
            "the tracker never sent anything — is replay.enabled on, was consent granted, and did the frontend restart since?",
          timeout: 30_000,
        })
        .toBeGreaterThan(0)

      await page.locator('input[name="field:diet"]').fill(SENTINEL)
      await page.locator('input[name="consent:conduct"]').check()
      await page.locator('input[name="field:diet"]').blur()
      // Let the typing reach the wire before anything navigates away.
      await page.waitForTimeout(5_000)

      const file = writeCapture("masked", cap.chunks)
      console.log(`masked capture: ${bytes(cap.chunks)} bytes -> ${file}`)

      expect(
        bytes(cap.chunks),
        "no ingest traffic captured — the tracker never started",
      ).toBeGreaterThan(0)

      // Positive control WITHIN this run. Attribute values other than href,
      // alt and placeholder are transmitted verbatim (they are structure, not
      // prose), so the input's own `name` proves THE ELEMENT WE TYPED INTO is
      // in these very bytes. That is what makes the next assertion mean
      // "the value was masked" rather than "the field was never recorded".
      expect(
        contains(cap.chunks, "field:diet"),
        "the input we typed into is not in the capture — this run recorded some other DOM",
      ).toBe(true)

      // The assertion the whole file exists for.
      expect(
        contains(cap.chunks, SENTINEL),
        `the sentinel typed into the registration form WAS transmitted to OpenReplay (see ${file})`,
      ).toBe(false)

      // Found by reading a capture rather than by reasoning about the options:
      // the tracker stars TEXT nodes but sends ATTRIBUTE values as they are,
      // so `title={userName}` on the NavBar monogram shipped the signed-in
      // person's full name in clear while the same name one element away
      // arrived as asterisks. The attribute is gone; this keeps it gone, and
      // will catch the next `title=`/`aria-label=` that carries personal data.
      expect(
        contains(cap.chunks, "Bob Henderson"),
        "the signed-in user's display name was transmitted — something is putting personal data in an ATTRIBUTE, which no masking option covers",
      ).toBe(false)

      // NO URL EVER CARRIES A PATH. Also found by reading a capture: privateMode
      // wipes the page LOCATION, but the tracker stamps `document.baseURI` — the
      // full current URL — onto every URL-based DOM message so the replayer can
      // resolve relative assets, and those are not sanitized. The bytes held
      // `http://localhost:8081/register/<uuid>` dozens of times.
      //
      // Route ids would have been arguable. `/invite/<token>` is not: that
      // token IS the credential, so a recording of somebody opening their
      // invitation would contain a working key to a private event.
      // `resourceBaseHref` pins the base to the origin; this is the proof.
      expect(
        contains(cap.chunks, `/register/${h1!.id}`),
        `the page path (with the hackathon id) was transmitted to OpenReplay (see ${file})`,
      ).toBe(false)
      expect(
        contains(cap.chunks, "/register/"),
        `a page path was transmitted to OpenReplay (see ${file})`,
      ).toBe(false)
    })
  })

  // A debugging tool that can take the product down is worse than no debugging
  // tool. The realistic failure is not "OpenReplay is off" — that path is the
  // default and every other suite exercises it — but "OpenReplay is CONFIGURED
  // and unreachable": the quick tunnel died, the stack was stopped, an ad
  // blocker ate the request. Aborting the ingest route reproduces exactly that
  // without touching the config, which is why this is a test rather than
  // something somebody remembers to try by hand.
  test.describe("a dead ingest endpoint", () => {
    test.use({ storageState: storageStatePath("bob") })

    test("does not take the app down with it", async ({
      page,
      context,
      baseURL,
    }) => {
      const failures: string[] = []
      page.on("pageerror", (e) => failures.push(String(e)))

      // Consent granted, or the tracker would never try to reach the endpoint
      // this test kills, and "an unreachable ingest does not break the page"
      // would be true about a page that never contacted it.
      await grantConsent(context, baseURL ?? "http://localhost:8081")
      await page.route("**/ingest/**", (route) => route.abort("connectionrefused"))

      await page.goto("/dashboard")
      await expect(page.getByRole("heading").first()).toBeVisible()

      // ...and still navigable afterwards, not merely first-paint intact.
      await page.goto("/account")
      await expect(page.getByRole("heading").first()).toBeVisible()

      expect(
        failures,
        "an unreachable ingest endpoint raised an uncaught error in the page",
      ).toEqual([])
    })
  })
})
