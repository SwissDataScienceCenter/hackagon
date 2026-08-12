import { test, expect, type Locator, type Page } from "@playwright/test"
import { storageStatePath } from "../../helpers/state.js"
import { rpcAs } from "../../helpers/api.js"
import { content } from "../../helpers/ui.js"
import { SEED_HACKATHONS } from "../../personas.js"

// Bulk team composition: the CSV/JSON template an organiser downloads, fills in
// and uploads back.
//
// Three things this file is built to catch, all of which are the shape of a bug
// that reports green:
//
//  1. A TEMPLATE ITS OWN IMPORTER REJECTS. Two halves shipped separately drift
//     apart in one commit, and the failure surfaces only when a real organiser
//     downloads one. So the template is not merely parsed here — it is fed
//     straight back into the importer through the UI, and the importer has to
//     accept every row.
//  2. A PARTIAL IMPORT. One bad row must block the whole file. Asserting "the
//     Apply button is gone" would pass just as well if the preview never
//     rendered, so that test carries a GOOD row alongside the bad one and reads
//     the roster back afterwards: the good row must not have been applied
//     either.
//  3. AN ASSERTION ON A CONTAINER. Membership is asserted on the people panel's
//     badge — the element that STATES which team someone is on — never on a card
//     that merely contains the team's name somewhere inside it.
//
// Cast: alice owns h1 in the seed fixture, so she is the organiser here.
// Mutations are undone at the end of the test that makes them, because the smoke
// suite shares one database.

const CSV = "text/csv"

/** A file the file input will accept, from a string. */
function file(name: string, body: string, mimeType = CSV) {
  return { name, mimeType, buffer: Buffer.from(body, "utf8") }
}

/** The people panel row for one participant. */
function personRow(page: Page, name: string): Locator {
  return content(page).locator("aside li").filter({ hasText: name })
}

/**
 * Which team the people panel says someone is on ("Unassigned" when none).
 *
 * `.badge` is a design-system primitive defined in the theme, not an ad-hoc
 * utility list, and it is the one element on the row that STATES the
 * membership — the row itself also carries the person's preferred projects and
 * registration answers, so any team name could match it by accident.
 */
function teamBadge(page: Page, name: string): Locator {
  return personRow(page, name).locator("span.badge").first()
}

/**
 * The badge's text as `toHaveText` will compare it.
 *
 * `textContent`, NOT `innerText`: `.badge` uppercases in CSS, so `innerText`
 * returns "UNASSIGNED" (the rendered text) while `toHaveText` matches against
 * "Unassigned" (the DOM text) — snapshotting with the wrong one fails an
 * unchanged badge against itself.
 */
async function teamBadgeText(page: Page, name: string): Promise<string> {
  return ((await teamBadge(page, name).textContent()) ?? "").trim()
}

/** The preview's outcome cell for a row, by the sentence it states. */
function outcome(page: Page, text: string | RegExp): Locator {
  return content(page).getByRole("cell", { name: text })
}

async function uploadAndPreview(page: Page, f: ReturnType<typeof file>) {
  await page.locator("input[type=file]").setInputFiles(f)
  await content(page).getByRole("button", { name: "Preview import" }).click()
}

/** Team names this file creates; anything matching is its own litter. */
const SCRATCH_TEAM = "Import Squad"

/**
 * Put Bob back on no team and delete this file's leftover teams, over gRPC.
 *
 * The smoke suite shares one database and a test that dies midway leaves its
 * mutation behind — after which "joins X" becomes "moves from Y to X" and an
 * exact-wording assertion fails for a reason that has nothing to do with the
 * code. Rather than weaken the wording (which is the part worth pinning), each
 * test that depends on Bob's position states it first.
 */
async function resetBob(hackathonId: string): Promise<string> {
  const h = await rpcAs("alice", "hackathon.HackathonService/Get", {
    hackathonId,
  })
  const bobId = (h.data?.hackathon?.members ?? []).find(
    (m: { user?: { email?: string } }) => m.user?.email === "bob@mail.org",
  )?.user?.id
  if (!bobId) {
    throw new Error(
      `bob@mail.org is not a member of the seeded hackathon (${h.raw.slice(0, 200)})`,
    )
  }

  const teams = await rpcAs("alice", "hackathon.TeamService/List", { hackathonId })
  for (const t of teams.data?.teams ?? []) {
    if ((t.members ?? []).some((m: { id?: string }) => m.id === bobId)) {
      await rpcAs("alice", "hackathon.TeamService/RemoveUser", {
        teamId: t.id,
        userId: bobId,
      })
    }
    if (String(t.name ?? "").startsWith(SCRATCH_TEAM)) {
      await rpcAs("alice", "hackathon.TeamService/Delete", { id: t.id })
    }
  }

  return bobId
}

test.describe("team import", () => {
  test.use({ storageState: storageStatePath("alice") })

  let hackathonId = ""

  // Over gRPC, not through the dashboard. Every test here needs the id, and a
  // browser round-trip to find it is one more page load per test that can fail
  // for a reason this file is not about — Playwright also restarts its worker
  // after a timeout, which resets any id cached in this closure, so a single
  // wobble turned into five identical failures pointing at the dashboard.
  test.beforeAll(async () => {
    // Retried, because this is environment DISCOVERY and not an assertion: a
    // backend that is mid-restart when the first test starts must not be
    // reported as "the fixture is not seeded". The error still names what it
    // last saw, so a genuinely empty database says so rather than hanging.
    let res = await rpcAs("alice", "hackathon.HackathonService/List", {})
    for (let attempt = 1; attempt < 12 && !res.ok; attempt++) {
      await new Promise((r) => setTimeout(r, 5_000))
      res = await rpcAs("alice", "hackathon.HackathonService/List", {})
    }
    const found = (res.data?.hackathons ?? []).find(
      (h: { name?: string }) => h.name === SEED_HACKATHONS.h1.name,
    )
    if (!found?.id) {
      throw new Error(
        `no seeded hackathon "${SEED_HACKATHONS.h1.name}" over the API — is the fixture seeded? (${res.raw.slice(0, 300)})`,
      )
    }
    hackathonId = found.id as string
  })

  test.beforeEach(async ({ page }) => {
    await page.goto(`/my/hackathon/${hackathonId}/teams/manage`)
    await expect(
      content(page).getByRole("heading", { name: "Import team composition" }),
    ).toBeVisible()
  })

  test("the template downloads in both formats, with the columns the importer reads", async ({
    page,
    request,
  }) => {
    const csv = await request.get(
      `/my/hackathon/${hackathonId}/teams/manage/template/csv`,
    )
    expect(csv.status()).toBe(200)
    expect(csv.headers()["content-type"]).toContain("text/csv")
    expect(
      csv.headers()["content-disposition"],
      "a template that renders in the tab instead of downloading is not a template",
    ).toContain("attachment")

    const lines = (await csv.text()).split("\r\n").filter(Boolean)
    expect(lines[0]).toBe('"user_email","project","team"')

    // REAL data, from this event. A template full of invented project names
    // teaches the wrong values, so the seeded roster has to be in here.
    const body = lines.slice(1).join("\n")
    expect(
      lines.length,
      "the fixture has confirmed participants, so the template cannot be header-only",
    ).toBeGreaterThan(1)
    expect(body).toContain("alice@mail.com")
    expect(body).toContain("AutoML Pipeline Builder")
    expect(body).toContain("Team Alpha")

    const json = await request.get(
      `/my/hackathon/${hackathonId}/teams/manage/template/json`,
    )
    expect(json.status()).toBe(200)
    expect(json.headers()["content-type"]).toContain("application/json")
    const rows = JSON.parse(await json.text()) as Record<string, string>[]
    expect(rows.length).toBe(lines.length - 1)
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(["project", "team", "user_email"])
    }

    // A format the endpoint does not know is a 404, not a silent CSV.
    expect(
      (await request.get(`/my/hackathon/${hackathonId}/teams/manage/template/xlsx`)).status(),
    ).toBe(404)
  })

  test("the importer accepts the template the page hands out", async ({
    page,
    request,
  }) => {
    // The guard: download, upload the SAME bytes, and require that every row
    // resolves. Nothing is applied — this is about the two halves agreeing.
    const csv = await (
      await request.get(`/my/hackathon/${hackathonId}/teams/manage/template/csv`)
    ).text()

    await uploadAndPreview(page, file("teams.csv", csv))

    const summary = content(page).getByRole("status")
    await expect(summary).toContainText(/teams\.csv: \d+ rows?/)
    await expect(summary).toContainText("Nothing has been changed yet")

    // Positive control: the table has to have rows, or "no row failed" is a
    // statement about an empty table.
    const rows = content(page).locator("tbody tr")
    expect(
      await rows.count(),
      "the preview must list the template's rows, or the checks below are vacuous",
    ).toBeGreaterThan(0)
    await expect(
      outcome(page, "Cannot apply"),
      "a template its own importer refuses is the failure this test exists for",
    ).toHaveCount(0)
    await expect(content(page).getByRole("alert")).toHaveCount(0)
  })

  test("applying the template repairs someone who is on two teams", async ({
    page,
    request,
  }) => {
    // A participant on TWO teams is a state the DB permits and the product does
    // not ("everyone belongs to at most one team"). The template states one of
    // them, so applying it has to REMOVE the other — and this is the one apply
    // path where the target assignment must be SKIPPED, because
    // `team_participants` has a composite primary key on (user_id, team_id) and
    // re-adding an existing member is a constraint violation rather than a no-op.
    //
    // The drift is CREATED here over gRPC rather than taken from the seed. The
    // seed happens to ship one, but this test consumes it — so depending on it
    // makes the test pass once per database and silently self-defeat on every
    // rerun. `AssignUser` is also the only way to reach this state: the drag
    // board and the importer both enforce the single-team rule.
    const teams = await rpcAs("alice", "hackathon.TeamService/List", {
      hackathonId,
    })
    const beta = (teams.data?.teams ?? []).find(
      (t: { name?: string }) => t.name === "Team Beta",
    )
    const alpha = (teams.data?.teams ?? []).find(
      (t: { name?: string }) => t.name === "Team Alpha",
    )
    expect(beta?.id, "the seed's Team Beta should exist").toBeTruthy()
    expect(alpha?.id, "the seed's Team Alpha should exist").toBeTruthy()

    const me = await rpcAs("alice", "user.UserService/WhoAmI", {})
    const aliceId = me.data?.user?.id
    expect(aliceId, "WhoAmI should name alice's platform id").toBeTruthy()

    // Idempotent: a rerun finds her already there, which is the same state.
    await rpcAs("alice", "hackathon.TeamService/AssignUser", {
      teamId: beta.id,
      userId: aliceId,
    })
    await page.reload()
    // The card is reached through its OWN header, not by class or by "a section
    // containing this text": the enclosing Projects panel is also a `.card` and
    // also contains the string "Team Beta", so filtering on text would scope the
    // search to a container holding EVERY team's chips — and then the count below
    // would be about the whole board. Only a team card has a `<header>`.
    const unassignAlice = (team: string) =>
      content(page)
        .locator("header")
        .filter({ hasText: team })
        .locator("xpath=..")
        .getByRole("button", { name: "Unassign Alice Wonderland" })

    // Positive control: the drift this test repairs has to be there first, and
    // on BOTH teams — otherwise "she is only on Alpha at the end" is a statement
    // about a roster that was already correct.
    await expect(
      unassignAlice("Team Beta"),
      "alice should be on Team Beta — without the drift there is nothing to repair",
    ).toHaveCount(1)
    await expect(unassignAlice("Team Alpha")).toHaveCount(1)

    const csv = await (
      await request.get(`/my/hackathon/${hackathonId}/teams/manage/template/csv`)
    ).text()
    await uploadAndPreview(page, file("teams.csv", csv))
    await expect(
      outcome(page, 'stays on "Team Alpha" and leaves "Team Beta"'),
    ).toBeVisible()

    await content(page).getByRole("button", { name: "Apply 1 change" }).click()
    await expect(content(page).getByRole("status")).toContainText(
      "Applied 1 of 1 changes",
    )
    await expect(
      content(page).getByRole("alert"),
      "a row that only needs a departure written must not report a failure",
    ).toHaveCount(0)

    await page.reload()
    await expect(unassignAlice("Team Beta")).toHaveCount(0)
    await expect(
      unassignAlice("Team Alpha"),
      "the team the file NAMED must keep her — a repair is not a removal",
    ).toHaveCount(1)
  })

  test("a clean import creates a team, staffs it, and can take the person back off", async ({
    page,
  }) => {
    await resetBob(hackathonId)
    await page.reload()

    const teamName = `${SCRATCH_TEAM} ${Date.now().toString(36)}`
    const before = await teamBadgeText(page, "Bob Henderson")
    expect(before, "this test needs Bob unplaced to start").toBe("Unassigned")

    await uploadAndPreview(
      page,
      file(
        "assign.csv",
        `user_email,project,team\r\nbob@mail.org,Multilingual Chatbot,${teamName}\r\n`,
      ),
    )

    // The preview states the effect before anything happens.
    await expect(
      outcome(page, `joins a new team "${teamName}" under "Multilingual Chatbot"`),
    ).toBeVisible()
    await expect(
      teamBadge(page, "Bob Henderson"),
      "the preview must not have moved anyone",
    ).toHaveText(before)

    await content(page).getByRole("button", { name: "Apply 1 change" }).click()

    await expect(content(page).getByRole("status")).toContainText(
      "Applied 1 of 1 changes from assign.csv, creating 1 team.",
    )
    // The end state, read off the element that states it.
    await expect(teamBadge(page, "Bob Henderson")).toHaveText(teamName)

    // A blank project and team takes him back off — the same file shape, the
    // other direction, which is what makes a downloaded roster editable.
    await uploadAndPreview(
      page,
      file("unassign.csv", `user_email,project,team\r\nbob@mail.org,,\r\n`),
    )
    await expect(outcome(page, `leaves "${teamName}"`)).toBeVisible()
    await content(page).getByRole("button", { name: "Apply 1 change" }).click()
    await expect(teamBadge(page, "Bob Henderson")).toHaveText("Unassigned")

    // Clean up the team this test created: the smoke suite shares one database.
    page.on("dialog", (d) => d.accept())
    await content(page).getByRole("button", { name: `Delete ${teamName}` }).click()
    await expect(
      content(page).getByRole("button", { name: `Delete ${teamName}` }),
    ).toHaveCount(0)
  })

  test("one unknown email blocks the whole file, including its good rows", async ({
    page,
  }) => {
    await resetBob(hackathonId)
    await page.reload()

    const before = await teamBadgeText(page, "Bob Henderson")
    expect(before, "this test needs Bob unplaced to start").toBe("Unassigned")

    await uploadAndPreview(
      page,
      file(
        "mixed.csv",
        "user_email,project,team\r\n" +
          "bob@mail.org,Multilingual Chatbot,Team Beta\r\n" +
          "nobody@example.org,Multilingual Chatbot,Team Beta\r\n",
      ),
    )

    // The bad row says which row and why, by email.
    await expect(
      outcome(
        page,
        'no participant of this hackathon has the email "nobody@example.org"',
      ),
    ).toBeVisible()
    // The good row is still resolved and shown — the organiser sees the whole
    // file judged, not just the first failure.
    await expect(outcome(page, 'joins "Team Beta" (Multilingual Chatbot)')).toBeVisible()

    await expect(content(page).getByRole("alert")).toContainText(
      "1 of 2 rows in mixed.csv cannot be applied",
    )
    await expect(content(page).getByRole("alert")).toContainText(
      "Nothing has been changed",
    )
    await expect(
      content(page).getByRole("button", { name: /^Apply/ }),
      "an all-or-nothing file must not offer to apply its good half",
    ).toHaveCount(0)

    // And it really was nothing: the good row did not sneak through.
    await page.reload()
    await expect(teamBadge(page, "Bob Henderson")).toHaveText(before)
  })

  test("a project this event does not have is named, and nothing is applied", async ({
    page,
  }) => {
    const before = await teamBadgeText(page, "Bob Henderson")

    await uploadAndPreview(
      page,
      file(
        "badproject.csv",
        "user_email,project,team\r\nbob@mail.org,Quantum Blockchain,Team Q\r\n",
      ),
    )

    // A different answer to a different question: the person resolved, the
    // project did not, and "row 1 failed" would leave the organiser guessing.
    await expect(
      outcome(page, 'no project of this hackathon is titled "Quantum Blockchain"'),
    ).toBeVisible()
    await expect(
      content(page).getByRole("button", { name: /^Apply/ }),
    ).toHaveCount(0)

    await page.reload()
    await expect(teamBadge(page, "Bob Henderson")).toHaveText(before)
  })
})
