import type { Page } from "@playwright/test"

// Seeded hackathon UUIDs are generated at seed time, so tests discover them
// through the UI the same way a user would — by name.

/** Id of a PUBLIC hackathon, read from the anonymous home page row link. */
export async function publicHackathonId(page: Page, name: string): Promise<string> {
  await page.goto("/")
  const href = await page
    .locator('a[href^="/hackathon/"]')
    .filter({ hasText: name })
    .first()
    .getAttribute("href")
  const id = href?.match(/^\/hackathon\/([^/]+)/)?.[1]
  if (!id) throw new Error(`Could not discover public hackathon id for "${name}"`)
  return id
}

/**
 * Id of a hackathon the (logged-in) page's persona is connected to, read from
 * the dashboard "Your hackathons" row link. Works for private hackathons too.
 */
export async function myHackathonId(page: Page, name: string): Promise<string> {
  await page.goto("/dashboard")
  const href = await page
    .locator('a[href^="/my/hackathon/"]')
    .filter({ hasText: name })
    .first()
    .getAttribute("href")
  const id = href?.match(/^\/my\/hackathon\/([^/]+)\//)?.[1]
  if (!id) throw new Error(`Could not discover member hackathon id for "${name}"`)
  return id
}
