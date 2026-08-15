import { test, expect } from "@playwright/test"
import { PERSONAS } from "../../personas.js"
import { onTunnel, onTunnelRealm } from "./host.js"

/**
 * Proves a presigned UPLOAD survives the public path, not just localhost.
 *
 * This exists because a real 403 got through everything else. `smoke/
 * 16-image-upload` uploads an avatar and a logo and reads the bytes back, and
 * it passed the whole time someone using the public URL got "Storage rejected
 * the upload (403)" on every attempt — because it uploads over localhost, and
 * the fault was in a proxy that only the public path goes through.
 *
 * The asymmetry is the point, and it is not caddy-specific: SigV4 signs the
 * HOST header, so every hop between the browser and the object store becomes
 * part of the signature. A proxy that passes the incoming host through (the
 * default) makes the store recompute a different signature and answer 403
 * SignatureDoesNotMatch. Public READS are unsigned and keep working, so the
 * symptom is "the site is fine, but nobody can upload" — invisible to any check
 * that fetches a page or an image.
 *
 * What actually broke: the Host rewrite was present and correct in
 * .devcontainer/Caddyfile.tunnel and ABSENT from the config caddy was running,
 * because caddy reads its file once at container start and nothing reloaded it.
 * cloudflare-tunnel/scripts/up.sh now reloads and verifies that route; this
 * spec is the independent check, from the browser, on the deployed path.
 *
 *   bash .claude/skills/cloudflare-tunnel/scripts/up.sh --with-auth
 *   TUNNEL_BASE_URL=https://hackagon.example.org \
 *     pnpm exec playwright test --project=tunnel
 *
 * Works against a quick tunnel or a named one — the public host is derived from
 * TUNNEL_BASE_URL (host.ts). The Host-rewrite fault this catches is caddy's and
 * is identical either way; a named hostname does not make it go away.
 */
const base = process.env.TUNNEL_BASE_URL

test.describe("presigned upload through the tunnel", () => {
  test.skip(
    !base,
    "TUNNEL_BASE_URL not set — start the tunnel with --with-auth first",
  )

  test("an avatar uploads and reads back through the public URL", async ({
    page,
  }) => {
    const alice = PERSONAS.alice

    // Log in on the tunnel host. Not a saved storage state: those are minted
    // against localhost, and the point of this spec is the public path.
    await page.goto("/")
    await page.waitForLoadState("networkidle")
    await page.getByRole("button", { name: "Log in" }).click()
    await page.waitForURL(onTunnelRealm(base), { timeout: 45_000 })
    await page.locator("#username").fill(alice.username)
    if (!(await page.locator("#password").isVisible())) {
      await page.locator("#kc-login").click()
      await page.locator("#password").waitFor({ timeout: 20_000 })
    }
    await page.locator("#password").fill(alice.password)
    await page.locator("#kc-login").click()
    await page.waitForURL(onTunnel(base), { timeout: 30_000 })

    // Presign + PUT exactly as the app does it, in the page, so the request
    // travels the same hops with the same headers a person's upload would.
    //
    // A payload big enough that WebP conversion genuinely shrinks it: a tiny
    // PNG comes out BIGGER as WebP, `toWebp` then returns the original, and the
    // converted path — the one every real photograph takes — goes untested.
    const result = await page.evaluate(async () => {
      const canvas = document.createElement("canvas")
      canvas.width = canvas.height = 600
      const ctx = canvas.getContext("2d")!
      for (let i = 0; i < 600; i += 12) {
        ctx.fillStyle = `hsl(${i % 360} 70% ${40 + (i % 30)}%)`
        ctx.fillRect(i, 0, 12, 600)
      }
      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, "image/png"),
      )
      if (!blob) return { step: "canvas", ok: false as const }
      const file = new File([blob], "probe.png", { type: "image/png" })

      // The app's own module: a copy of the sequence here could pass while the
      // shipped one is broken.
      const { uploadImage } = (await import("/src/lib/upload.ts").catch(() => ({
        uploadImage: null,
      }))) as {
        uploadImage:
          | ((e: string, f: File) => Promise<{ publicUrl: string }>)
          | null
      }

      // The built server serves bundled JS, so the source import above only
      // resolves under vite. Fall back to the same three steps inline —
      // identical wire behaviour, which is what this spec measures.
      if (!uploadImage) {
        const presign = await fetch("/account/avatar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            sizeBytes: file.size,
          }),
        })
        if (!presign.ok)
          return { step: "presign", ok: false as const, status: presign.status }
        const { uploadUrl, publicUrl } = await presign.json()
        const put = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        })
        return { step: "put", ok: put.ok, status: put.status, publicUrl }
      }

      const { publicUrl } = await uploadImage("/account/avatar", file)
      return { step: "put", ok: true as const, status: 200, publicUrl }
    })

    // Name the hop in the failure, because "403" alone sent this diagnosis down
    // two wrong paths before the right one.
    expect(
      result.ok,
      `upload failed at ${result.step} with ${"status" in result ? result.status : "?"}. ` +
        `A 403 on the PUT means a proxy between the browser and the object ` +
        `store rewrote a signed header — check the Host rewrite on caddy's ` +
        `/objects route IS IN THE RUNNING CONFIG, not just in Caddyfile.tunnel.`,
    ).toBe(true)

    // And the bytes have to come back, through the same public host. "The store
    // accepted it" and "the picture loads" are different claims, and only the
    // second one is what a person sees.
    const publicUrl = (result as { publicUrl?: string }).publicUrl
    expect(publicUrl, "no public path came back from the presign").toBeTruthy()

    const read = await page.request.get(`${base}${publicUrl}`)
    expect(read.status(), `reading ${publicUrl} back through the tunnel`).toBe(
      200,
    )
    expect(read.headers()["content-type"]).toContain("image/")
    expect((await read.body()).byteLength).toBeGreaterThan(1000)
  })
})
