import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../helpers/state.js"
import { rpcAs, rpcAnonymous } from "../../helpers/api.js"
import { SEED_HACKATHONS } from "../../personas.js"
import {
  batchMetaOffsets,
  bytes,
  captureIngest,
  captureIngestPosts,
  captureSessionIds,
  contains,
  grantConsent,
  replayConfig,
  writeCapture,
} from "./capture.js"
import { adminSession, mobPlaintext, waitForMob } from "./replayApi.js"

/*
 * A recording has to be WATCHABLE. Nothing here asserted that, and a totally
 * broken pipeline reported green because of it.
 *
 * Every other spec in this folder measures bytes leaving the browser. That is
 * the right measurement for a privacy claim — "nothing left" is a statement
 * about the visitor, "the component checked a flag" is a statement about our
 * code — and it says nothing whatsoever about whether the far end could use
 * what arrived. It could not. Bytes reached the ingest endpoint, it answered
 * 200, and every session was unplayable: no recording file was ever written,
 * and the player spun forever on a session that was right there in the list.
 * Three separate faults produced that, and not one of them could turn a spec
 * in this folder red, because none of them are on the browser's side of the
 * wire.
 *
 * So this file asks the far end. It records a real session, reads the session
 * id off the tracker's own start response, and waits for the RECORDING to
 * exist and come back through the same two hops the player uses.
 *
 * The three faults, named because each is invisible from here in a different
 * way and this is now the assertion that catches all of them:
 *
 *  - The batches were rejected. `Iterate` (backend/pkg/messages/iterator.go)
 *    RETURNS on the first parse error, so a batch its reader will not accept
 *    is discarded WHOLE — including the one carrying the first DOM snapshot.
 *    The symptom is a `broken batch(es)` line in `docker logs ender` and
 *    nothing at all on our side.
 *  - The `sink` container, which writes the raw session file every later stage
 *    reads, was simply not running. `docker compose ps` looks healthy when a
 *    service is absent rather than unhealthy.
 *  - The object store answered `NoSuchBucket` to every request, PUT included,
 *    for a bucket that was right there on its disk. Uploads failed silently;
 *    restarting it fixed it.
 *
 * The first test asserts the batch SHAPE on the way out, because a red "no
 * recording after four minutes" says the pipeline is broken and not where.
 * The second records one session, proves it became a recording, and proves the
 * invite token is in neither the wire nor the stored file — the two properties
 * `SessionReplay.svelte` has to keep at the same time, asserted on the same
 * session, because keeping either one alone is easy.
 *
 * Needs `replay.enabled: true` in the frontend config pointed at a live
 * OpenReplay (`.claude/skills/openreplay-stack`) AND that stack's admin
 * credentials in its gitignored `.secrets.env` — reading a stored recording is
 * an authenticated operation. Self-skips without the config, like every spec
 * here; does NOT self-skip without the credentials, because a missing password
 * file is a broken rig, not a reason to stop asserting.
 */

const REPLAY = replayConfig()

test.describe("a recorded session is playable", () => {
  test.skip(
    !REPLAY,
    "replay.enabled is not true in the frontend config — bring up .claude/skills/openreplay-stack and wire it first",
  )
  test.describe.configure({ mode: "serial" })

  test.describe("the batches on the way out", () => {
    test.use({ storageState: storageStatePath("bob") })

    test("each begin with their own batch header", async ({
      page,
      context,
      baseURL,
    }) => {
      test.setTimeout(120_000)
      await grantConsent(context, baseURL ?? "http://localhost:8081")

      const cap = captureIngest(page)
      const detailed = captureIngestPosts(page)

      await page.goto("/dashboard")
      await expect(page.getByRole("heading").first()).toBeVisible()
      await expect
        .poll(() => cap.chunks.length, {
          message:
            "the tracker never sent anything — is replay.enabled on, was consent granted, and did the frontend restart since?",
          timeout: 30_000,
        })
        .toBeGreaterThan(0)

      // Move around so the DOM mutates and the asset stream has content: the
      // defect only appears in a batch carrying BOTH the player stream and the
      // asset stream, which is the batch holding the first DOM snapshot of any
      // page with stylesheets.
      await page.mouse.wheel(0, 400)
      await page.waitForTimeout(6_000)

      const file = writeCapture("playable-shape", cap.chunks)
      expect(
        bytes(cap.chunks),
        "no ingest traffic captured — the tracker never started",
      ).toBeGreaterThan(0)

      // Positive control. If nothing captured is a batch header at all then
      // the walker cannot read this traffic, and "no misplaced header" would
      // be true of any buffer whatsoever — an empty one included.
      const wellFormed = detailed.posts.filter(
        (p) => batchMetaOffsets(p.body)[0] === 0,
      )
      expect(
        wellFormed.length,
        `no captured batch begins with a BatchMetadata — the batch walker cannot read this traffic (see ${file})`,
      ).toBeGreaterThan(0)

      // The assertion. A `visual` batch is the player batch and the asset
      // batch glued together and legitimately holds two headers — but only
      // because the request tells the ingest endpoint where the seam is, and
      // it splits the body there before queueing the halves. Without that
      // parameter the backend parses one buffer, meets the second header,
      // answers "batch meta not at the start of batch", and drops the batch
      // that carried the DOM.
      const misplaced = detailed.posts
        .map((p) => ({ ...p, metas: batchMetaOffsets(p.body) }))
        .filter((p) => p.metas.some((o) => o !== 0))
        .filter((p) => {
          const split = new URL(p.url).searchParams.get("split")

          return !(
            split !== null &&
            p.metas.length === 2 &&
            p.metas[1] === Number(split)
          )
        })
        .map(
          (p) =>
            `${p.dataType || "?"} batch, headers at [${p.metas.join(", ")}], split=${
              new URL(p.url).searchParams.get("split") ?? "(absent)"
            }, ${p.body.length} bytes`,
        )

      expect(
        misplaced,
        `a batch carries a BatchMetadata that is neither at its start nor at a declared split — OpenReplay's reader answers "batch meta not at the start of batch" and DISCARDS the whole batch, so the session never becomes playable (see ${file})`,
      ).toEqual([])
    })
  })

  test.describe("an invitation opened by a stranger", () => {
    // No storage state: the leak this guards was a FRESH load of an invite
    // link, by someone who has not signed in and may not even have an account.
    // That page load is a first batch, and the first batch is the one carrying
    // the header this is all about.
    test.use({ storageState: { cookies: [], origins: [] } })

    test("becomes a playable recording that does not contain the token", async ({
      page,
      context,
      baseURL,
    }) => {
      // ender closes a session on inactivity and storage only uploads after
      // that, so the wait is minutes rather than seconds.
      test.setTimeout(420_000)

      const admin = await adminSession(REPLAY!.ingestPoint, REPLAY!.projectKey)
      expect(
        admin,
        `could not log in to OpenReplay at ${REPLAY!.ingestPoint} — is the stack up, and does .claude/skills/openreplay-stack/.secrets.env hold its admin credentials? (openreplay-stack/scripts/signup.sh mints them)`,
      ).not.toBeNull()

      const listed = rpcAnonymous("hackathon.HackathonService/List", {
        visibilityFilter: 1,
      })
      expect(listed.ok, listed.raw).toBe(true)
      const h1 = (
        listed.data.hackathons as { id: string; name: string }[]
      ).find((h) => h.name === SEED_HACKATHONS.h1.name)
      expect(
        h1,
        "seed hackathon h1 not found — did `just db::seed` run?",
      ).toBeTruthy()

      const created = await rpcAs("alice", "hackathon.HackathonService/CreateInvite", {
        hackathonId: h1!.id,
        note: "session replay leak check",
      })
      expect(created.ok, created.raw).toBe(true)
      const token = (created.data.invite as { token: string }).token
      expect(token, "CreateInvite returned no token").toBeTruthy()

      await grantConsent(context, baseURL ?? "http://localhost:8081")
      const cap = captureIngest(page)
      const posts = captureIngestPosts(page)
      const sessions = captureSessionIds(page)

      await page.goto(`/invite/${token}`)
      await expect(page.getByRole("heading").first()).toBeVisible()

      // WAIT FOR A BATCH, NOT FOR TRAFFIC. `/v1/web/start` is under /ingest
      // too, so "something was posted" is satisfied ~100ms before the DOM
      // snapshot exists — and the first version of this test then navigated
      // away inside that window. The snapshot went out during unload as a
      // keepalive fetch, which the page's `request` event never reported: the
      // capture held two start bodies and the NEXT page's DOM, so the invite
      // page was never in the bytes being searched. A token-absent grep over
      // a recording of somewhere else is the exact false green this folder
      // exists to prevent.
      await expect
        .poll(() => posts.posts.filter((p) => p.url.includes("/v1/web/i")).length, {
          message:
            "the tracker sent no batch on the invite page — is replay.enabled on, was consent granted, and did the frontend restart since?",
          timeout: 30_000,
        })
        .toBeGreaterThan(0)

      // Stay here. This page load IS the subject: a fresh open of an invite
      // link is a first batch, and the first batch carries the header whose
      // last field is the URL. Moving to a second page would only add a
      // second session to be confused about.
      await page.mouse.move(200, 200)
      await page.mouse.wheel(0, 300)
      await page.waitForTimeout(8_000)

      const file = writeCapture("invite", cap.chunks)
      console.log(`invite capture: ${bytes(cap.chunks)} bytes -> ${file}`)

      // ── property 1, on the wire ──────────────────────────────────────────
      // Positive control first: the invite page's own form posts to this
      // route's named action, and attribute values are transmitted verbatim
      // (masking covers text nodes and input values; only href is blanked and
      // only alt/placeholder are starred). Finding it proves this capture
      // holds the invite page's DOM, which is what makes the token's absence
      // mean "it was kept out" rather than "that page was never recorded".
      expect(
        contains(cap.chunks, "?/join"),
        `the invite page's own form is not in the capture — this run recorded some other DOM, so it proves nothing about the token (see ${file})`,
      ).toBe(true)
      expect(
        contains(cap.chunks, token),
        `THE INVITE TOKEN WAS TRANSMITTED to OpenReplay. That token is the credential — the invite route is public precisely because the URL authenticates the visitor — so this recording is a working key to a private event (see ${file})`,
      ).toBe(false)

      await expect
        .poll(() => sessions.ids.length, {
          message:
            "no session id came back from /v1/web/start — the ingest endpoint never accepted a session",
          timeout: 30_000,
        })
        .toBeGreaterThan(0)
      const sessionId = sessions.ids[0]
      console.log(`recorded session ${sessionId}`)

      // Closing the page ends the session promptly. It is an OPTIMISATION,
      // never a requirement — ender closes an idle session on its own timer —
      // so it must not be able to block this test, and left plain it did:
      // twice, the run sat here until Playwright's own 7-minute timeout, which
      // reports "slow test" and not "no recording appeared". The tracker sends
      // its last batch from a pagehide handler as a keepalive fetch, and
      // `page.close()` waits for that round trip to a Cloudflare quick tunnel.
      // Race it and carry on either way.
      await Promise.race([
        page.close().catch(() => {}),
        new Promise((r) => setTimeout(r, 15_000)),
      ])

      // ── property 2: it is actually a recording ───────────────────────────
      const mob = await waitForMob(admin!, sessionId)
      console.log(
        `first-mob for ${sessionId}: ${
          mob.ok
            ? `${mob.bytes} bytes, zstd=${mob.compressed}`
            : `${mob.status} ${mob.detail}`
        }`,
      )

      expect(
        mob.ok,
        `session ${sessionId} took ${bytes(cap.chunks)} bytes of recording and produced NO mob file (${
          mob.ok ? "" : `${mob.status} ${mob.detail}`
        }) — it is in OpenReplay's session list and the player will spin on it forever. Check, in this order, each of which has produced exactly this failure: \`bash .claude/skills/openreplay-stack/scripts/doctor.sh\` (a compose service with no container — sink writes the raw file every later stage reads, and its absence looks like a healthy stack), \`docker exec minio ls /data/mobs\` together with a signed request to the store (it once answered NoSuchBucket for a bucket on its own disk until it was restarted), and \`docker logs ender\` (a "broken batch" line means the backend discarded a batch whole)`,
      ).toBe(true)
      if (!mob.ok) return

      // A zero-byte object is a file that exists and is not a recording: the
      // same spinner with a better-looking `ls`.
      expect(mob.bytes, `the mob file for ${sessionId} is empty`).toBeGreaterThan(
        0,
      )
      expect(
        mob.compressed,
        `the mob file for ${sessionId} is not a zstd frame — storage did not write it`,
      ).toBe(true)

      // ── property 1 again, in the stored artefact ─────────────────────────
      // A leak that moved off the wire and into the file is not a leak that
      // was fixed, and only this half can see that: everything up to here
      // watched the browser.
      const plain = mobPlaintext(mob.body)
      expect(
        plain.length,
        `the mob file for ${sessionId} did not decompress`,
      ).toBeGreaterThan(mob.bytes)
      expect(
        plain.includes(Buffer.from("?/join", "utf8")),
        "the stored recording does not contain the invite page's form — it is a recording of something else, so the token search below proves nothing",
      ).toBe(true)
      expect(
        plain.includes(Buffer.from(token, "utf8")),
        `THE INVITE TOKEN IS IN THE STORED RECORDING for session ${sessionId} — anyone with access to the replay UI holds a working key to a private event`,
      ).toBe(false)
    })
  })
})
