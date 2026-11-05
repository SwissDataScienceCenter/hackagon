import { describe, expect, it } from "vitest"
import { BACK_NAMES, backFor, type Back } from "./backLink"

const H = "/(app)/my/hackathon/[id]"
const page = (path: string, routeId: string | null) => ({
  url: new URL(`http://localhost${path}`),
  routeId,
})
const to = (path: string) => ({ url: new URL(`http://localhost${path}`) })

describe("backFor", () => {
  it("has nothing on the first page a browser loads", () => {
    expect(backFor(null, to("/my/hackathon/h1/teams/t1"), undefined)).toBe(
      undefined,
    )
  })

  it("leads back to the page left, by name, one step away", () => {
    expect(
      backFor(
        page("/my/hackathon/h1/voting", `${H}/voting`),
        to("/my/hackathon/h1/submissions/t1"),
        undefined,
      ),
    ).toEqual({
      href: "/my/hackathon/h1/voting",
      label: "Back to voting",
      adjacent: true,
    })
  })

  it("keeps the query of the page left, so a filtered list comes back filtered", () => {
    expect(
      backFor(
        page(
          "/my/hackathon/h1/projects/manage?status=pending",
          `${H}/projects/manage`,
        ),
        to("/my/hackathon/h1/projects/manage/p1"),
        undefined,
      )?.href,
    ).toBe("/my/hackathon/h1/projects/manage?status=pending")
  })

  it("says plain Back for a page it has no name for", () => {
    expect(
      backFor(
        page("/my/hackathon/h1/pages", `${H}/pages`),
        to("/my/hackathon/h1/teams/t1"),
        undefined,
      )?.label,
    ).toBe("Back")
  })

  it("never leads back into a form", () => {
    for (const routeId of [
      `${H}/projects/[projectId]/edit`,
      `${H}/projects/propose`,
      `${H}/pages/new`,
      "/(app)/hackathons/create",
    ]) {
      expect(
        backFor(
          page("/somewhere", routeId),
          to("/my/hackathon/h1/projects/p1"),
          undefined,
        ),
      ).toBe(undefined)
    }
  })

  it("has nothing when the page left matched no route", () => {
    expect(
      backFor(page("/nope", null), to("/my/hackathon/h1/teams/t1"), undefined),
    ).toBe(undefined)
  })

  describe("on a change of the same page's query", () => {
    const fromBack: Back = {
      href: "/my/hackathon/h1/voting",
      label: "Back to voting",
      adjacent: true,
    }

    it("keeps the way back, no longer one step away", () => {
      expect(
        backFor(
          page("/my/hackathon/h1/submissions/mine", `${H}/submissions/mine`),
          to("/my/hackathon/h1/submissions/mine?edit=t1"),
          fromBack,
        ),
      ).toEqual({ ...fromBack, adjacent: false })
    })

    it("stays on the list when there was no way back", () => {
      expect(
        backFor(
          page("/my/hackathon/h1/submissions/mine", `${H}/submissions/mine`),
          to("/my/hackathon/h1/submissions/mine?edit=t1"),
          undefined,
        ),
      ).toBe(undefined)
    })
  })
})

describe("BACK_NAMES", () => {
  // Every route with a page, as SvelteKit derives its id from the file path.
  const routeIds = Object.keys(
    import.meta.glob("/src/routes/**/+page.svelte"),
  ).map((file) =>
    file.replace(/^\/src\/routes/, "").replace(/\/\+page\.svelte$/, ""),
  )

  it.each(Object.keys(BACK_NAMES))("names a route that exists: %s", (id) => {
    expect(routeIds).toContain(id)
  })
})
