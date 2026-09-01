import { describe, it, expect } from "vitest"
import { manageNav, memberNav, platformNav, type NavItem } from "./items"
import { activeNavId } from "./active"

// HackathonRole numeric values.
const ROLE_UNSPECIFIED = 0
const ROLE_OWNER = 1
const ROLE_MEMBER = 2

const owner = { role: ROLE_OWNER, isWaiting: false }

const idsOf = (items: NavItem[]) => items.map((i) => i.id)

/**
 * Assert that `wanted` appear in `items` in that relative order, ignoring
 * anything else in the list.
 *
 * Deliberately not a full-array assertion. Asserting the entire id list fails
 * the day anyone adds an entry, so it reports "the nav changed" rather than "the
 * nav broke" — and because several tests each pinned the whole spine, one added
 * entry meant re-pasting all of them. Filtering to the entries a test is
 * actually about keeps it silent on additions and loud on the reorder or removal
 * it exists to catch.
 */
const expectOrder = (items: NavItem[], wanted: string[]) =>
  expect(idsOf(items).filter((id) => wanted.includes(id))).toEqual(wanted)

describe("memberNav", () => {
  // Published unless a test says otherwise — the hidden-page cases below are the
  // ones that care, and spelling `visible: true` out everywhere else buries them.
  const pg = (id: string, title: string, visible = true) => ({
    id,
    title,
    visible,
  })

  // With a phase, so Timeline has an entry at all — it is optional, like Teams
  // and About above it.
  it("orders the fixed destinations as a lifecycle", () => {
    expectOrder(memberNav("hack-1", [], false, false, 0, false, 1), [
      "member:overview",
      "member:participants",
      "member:projects",
      "member:submissions",
      "member:timeline",
    ])
  })

  // Phases are optional, so the entry is too — and unlike Teams, the organiser's
  // half is gated on the same count, because Settings is what leads to the first
  // phase.
  describe("phaseCount", () => {
    it("offers no Timeline entry with no phases", () => {
      expect(idsOf(memberNav("hack-1"))).not.toContain("member:timeline")
    })

    it("offers Timeline once a phase exists", () => {
      expect(
        idsOf(memberNav("hack-1", [], false, false, 0, false, 1)),
      ).toContain("member:timeline")
    })
  })

  // The description is optional on a hackathon, so the entry is too: About with
  // nothing on it is a destination that wastes the trip.
  describe("hasDescription", () => {
    it("offers no About entry when there is no description", () => {
      expect(
        idsOf(memberNav("hack-1", [], true, true, 1, false)),
      ).not.toContain("member:about")
    })

    // False by default, so a caller that has not looked cannot claim there is
    // one — the same contract `teamCount` and `trackCount` give.
    it("defaults to offering no About entry", () => {
      expect(idsOf(memberNav("hack-1"))).not.toContain("member:about")
    })

    it("offers it second, right after Overview", () => {
      const items = memberNav("hack-1", [], false, false, 0, true)

      expectOrder(items, [
        "member:overview",
        "member:about",
        "member:participants",
      ])
      const item = items.find((i) => i.id === "member:about")
      expect(item?.label).toBe("About")
      expect(item?.href).toBe("/my/hackathon/hack-1/about")
    })
  })

  // Not a permission — every confirmed member may read teams — but whether the
  // page has anything on it. Teams form partway through a hackathon, and before
  // they do the entry would lead to an empty list a participant cannot act on.
  describe("teamCount", () => {
    it("offers no Teams entry before any team exists", () => {
      expect(idsOf(memberNav("hack-1", [], true, true, 0))).not.toContain(
        "member:teams",
      )
    })

    // Zero by default, so a caller that has not counted cannot claim there are
    // teams — the same contract `manageNav` gives `trackCount`.
    it("defaults to offering no Teams entry", () => {
      expect(idsOf(memberNav("hack-1"))).not.toContain("member:teams")
    })

    it("offers it once a team exists", () => {
      const item = memberNav("hack-1", [], false, false, 1).find(
        (i) => i.id === "member:teams",
      )

      expect(item?.label).toBe("Teams")
      expect(item?.href).toBe("/my/hackathon/hack-1/teams")
    })

    // The list is where teams are browsed; the manage page is where they are
    // changed. `activeNavId`'s longest match is what keeps the two apart, and
    // `/teams/manage` nests under `/teams` precisely so it wins there.
    it("lights the member entry on the list and the manage entry on its page", () => {
      const items = [
        ...memberNav("hack-1", [], false, false, 2),
        ...manageNav("hack-1", owner, false),
      ]

      expect(activeNavId("/my/hackathon/hack-1/teams", items)).toBe(
        "member:teams",
      )
      expect(activeNavId("/my/hackathon/hack-1/teams/manage", items)).toBe(
        "manage:teams",
      )
    })

    // A team detail page is a team, so it belongs to the list rather than to the
    // organiser's workspace — and it is reachable from the ballot too, where
    // nothing else in the nav would light at all.
    it("keeps Teams lit on a team detail route", () => {
      const items = memberNav("hack-1", [], false, false, 2)

      expect(activeNavId("/my/hackathon/hack-1/teams/t1", items)).toBe(
        "member:teams",
      )
    })
  })

  // The only entries gated on anything. CAPABILITY_VOTE grants
  // `member → vote_category:read` and CAPABILITY_VIEW_RESULTS grants
  // `member → vote_result:read`; the backend keeps them separate so an organiser
  // can close voting, check the tally, then publish. All four combinations are
  // reachable, so all four are checked rather than the two in common use.
  it.each([
    { vote: false, viewResults: false, shown: [] as string[] },
    { vote: true, viewResults: false, shown: ["member:voting"] },
    { vote: false, viewResults: true, shown: ["member:results"] },
    {
      vote: true,
      viewResults: true,
      shown: ["member:voting", "member:results"],
    },
  ])(
    "with vote=$vote and viewResults=$viewResults, offers $shown",
    ({ vote, viewResults, shown }) => {
      const ids = idsOf(memberNav("hack-1", [], vote, viewResults))
      const gated = ["member:voting", "member:results"]

      expect(gated.filter((id) => ids.includes(id))).toEqual(shown)
    },
  )

  // Projects are approved, teams form on them, then teams submit.
  it("slots Teams between Projects and Submissions", () => {
    expectOrder(memberNav("hack-1", [], false, false, 2), [
      "member:projects",
      "member:teams",
      "member:submissions",
    ])
  })

  // The entries follow the hackathon's own order of events: you submit, then
  // people vote on what was submitted, then the tally is published.
  it("slots Voting and Results between Submissions and Timeline", () => {
    expectOrder(memberNav("hack-1", [], true, true, 0, false, 1), [
      "member:submissions",
      "member:voting",
      "member:results",
      "member:timeline",
    ])
  })

  // Manage Voting is the organiser's way in and is deliberately not gated the
  // same way: categories have to exist before voting opens, so gating the setup
  // screen on the capability would surface it only once it was too late to use.
  it("keeps Manage Voting available while participant Voting is hidden", () => {
    const ids = [
      ...idsOf(memberNav("hack-1", [], false)),
      ...idsOf(manageNav("hack-1", owner, false)),
    ]

    expect(ids).not.toContain("member:voting")
    expect(ids).toContain("manage:voting")
  })

  // The page list's length is the organiser's to change, so the fixed entries
  // must not move when it does.
  it("appends page entries after every fixed one", () => {
    const ids = idsOf(memberNav("hack-1", [pg("p1", "Welcome")], true, true))

    expect(ids.at(-1)).toBe("member:page:p1")
  })

  // Every project surface hangs off /projects, and Projects is the only entry
  // pointing into that subtree — so `activeNavId`'s longest-prefix match lights
  // it for all of them. Asserted because the sub-routes used to belong to a
  // second entry, and a revived one would take the highlight back off Projects
  // without anything else changing.
  it("keeps Projects lit across every project sub-route", () => {
    const items = memberNav("hack-1")

    for (const path of [
      "/my/hackathon/hack-1/projects",
      "/my/hackathon/hack-1/projects/propose",
      "/my/hackathon/hack-1/projects/p1",
      "/my/hackathon/hack-1/projects/p1/edit",
    ]) {
      expect(activeNavId(path, items)).toBe("member:projects")
    }
  })

  it("offers no Proposals entry, since the projects page carries them", () => {
    expect(idsOf(memberNav("hack-1", [], true, true))).not.toContain(
      "member:my-projects",
    )
  })

  it("labels a page entry with its title and links to it by id", () => {
    const item = memberNav("hack-1", [pg("p1", "Schedule")]).at(-1)

    expect(item?.label).toBe("Schedule")
    expect(item?.href).toBe("/my/hackathon/hack-1/pages/p1")
  })

  // PageService.List only filters hidden pages out for callers without
  // `page:write`, so an organiser's list arrives with them mixed in. Rendering one
  // identically to a published page leaves them no way to tell what is live.
  it("badges a page participants cannot see", () => {
    const item = memberNav("hack-1", [pg("p1", "Judging notes", false)]).at(-1)

    // "Hidden", not "Draft": the flag is about who may see the page, not how
    // finished it is.
    expect(item?.badge).toBe("Hidden")
    // A state, so a status hue and never the accent, which means role.
    expect(item?.badgeVariant).toBe("badge-warning")
    // Still linked: its organiser is exactly who needs to open it.
    expect(item?.href).toBe("/my/hackathon/hack-1/pages/p1")
  })

  it("leaves a published page unbadged", () => {
    const item = memberNav("hack-1", [pg("p1", "Welcome")]).at(-1)

    expect(item?.badge).toBeUndefined()
  })

  // The badge is dropped on the collapsed icon rail, so the icon has to carry the
  // distinction on its own.
  it("gives a hidden page a different icon from a published one", () => {
    const hidden = memberNav("hack-1", [pg("p1", "Notes", false)]).at(-1)
    const live = memberNav("hack-1", [pg("p2", "Live")]).at(-1)

    expect(hidden?.icon).not.toBe(live?.icon)
  })

  // Page titles are editable and need not be unique. Keying on them would give
  // two same-named pages the same key, which takes the sidebar's {#each} down.
  it("keys same-titled pages distinctly", () => {
    const items = memberNav("hack-1", [pg("p1", "Notes"), pg("p2", "Notes")])

    expect(new Set(idsOf(items)).size).toBe(items.length)
  })

  it("preserves the order it is given, since the backend already sorted it", () => {
    const titles = memberNav("hack-1", [
      pg("p2", "Schedule"),
      pg("p1", "Welcome"),
    ])
      .slice(-2)
      .map((i) => i.label)

    expect(titles).toEqual(["Schedule", "Welcome"])
  })

  // The spine an owner and a member discuss has to be the same one, so nothing
  // role-dependent may appear here whatever the capabilities say — otherwise the
  // two viewers stop seeing entries in the same places.
  it("carries only member entries, so the spine is role-independent", () => {
    const ids = idsOf(memberNav("hack-1", [pg("p1", "Welcome")], true, true, 2))

    expect(ids.filter((id) => !id.startsWith("member:"))).toEqual([])
  })
})

describe("manageNav", () => {
  it.each([
    {
      who: "a participant",
      membership: { role: ROLE_MEMBER, isWaiting: false },
    },
    { who: "someone with no membership row", membership: undefined },
    {
      who: "an unspecified role",
      membership: { role: ROLE_UNSPECIFIED, isWaiting: false },
    },
  ])(
    "is empty for $who, so the section does not render at all",
    ({ membership }) => {
      expect(manageNav("hack-1", membership, false)).toEqual([])
    },
  )

  // The persistent half of the organiser's state signal: the banner says what is
  // wrong, this says there is something to look at even when the banner is off
  // screen. It marks Settings because that is the page holding the switches. Off
  // by default so no caller gets it by accident.
  describe("needsAttention", () => {
    const entry = (items: NavItem[]) =>
      items.find((i) => i.id === "manage:settings")

    it("leaves Settings unbadged by default", () => {
      expect(entry(manageNav("hack-1", owner, false))?.badge).toBeUndefined()
    })

    it("badges Settings, and nothing else, when set", () => {
      const items = manageNav("hack-1", owner, false, true)
      expect(entry(items)).toMatchObject({
        badge: "!",
        badgeVariant: "badge-warning",
      })
      expect(
        items.filter((i) => i.badge !== undefined).map((i) => i.id),
      ).toEqual(["manage:settings"])
    })

    // The badge rides on a section a participant never receives, so a caller
    // passing it for the wrong viewer still shows them nothing.
    it("does not give a participant the section, badge or not", () => {
      expect(
        manageNav(
          "hack-1",
          { role: ROLE_MEMBER, isWaiting: false },
          false,
          true,
        ),
      ).toEqual([])
    })
  })

  // Order follows the participant entries these extend, so the two sections read
  // down the page in the same sequence.
  it("follows the order of the participant entries it extends", () => {
    expectOrder(manageNav("hack-1", owner, false, false, 3, false, 1), [
      "manage:settings",
      // One entry for both halves of the roster: the waitlist is its second tab,
      // not a row of its own.
      "manage:participants",
      "manage:forms",
      "manage:projects",
      "manage:tracks",
      "manage:teams",
      "manage:timeline",
      "manage:voting",
      "manage:pages",
    ])
  })

  // Same gate as the participant Timeline entry, and the reason it matters more
  // here: with Manage Timeline hidden, the "Where the hackathon is" card on
  // Settings is the only route to the first phase.
  describe("phaseCount", () => {
    it("offers no Manage Timeline entry with no phases", () => {
      expect(idsOf(manageNav("hack-1", owner, false))).not.toContain(
        "manage:timeline",
      )
    })

    it("offers Manage Timeline once a phase exists", () => {
      expect(
        idsOf(manageNav("hack-1", owner, false, false, 0, false, 1)),
      ).toContain("manage:timeline")
    })
  })

  // On a private hackathon the sign-up path reads in order: the roster somebody
  // ends up on, the link they arrive by, then the form they fill in.
  it("puts Invitations between the roster and the form when private", () => {
    expectOrder(manageNav("hack-1", owner, false, false, 0, true), [
      "manage:participants",
      "manage:invites",
      "manage:forms",
    ])
  })

  // A public hackathon is listed and joinable by anybody, so `Join` never looks
  // at a token there and a link would grant nothing. The RPCs would still
  // succeed — CreateInvite does not check visibility — which is exactly why this
  // is gated here rather than left to the backend to refuse.
  describe("isPrivate", () => {
    const hasInvitesEntry = (isPrivate?: boolean) =>
      idsOf(manageNav("hack-1", owner, false, false, 0, isPrivate)).includes(
        "manage:invites",
      )

    it("omits Invitations on a public hackathon", () => {
      expect(hasInvitesEntry(false)).toBe(false)
    })

    // Same honest default as the counts: a caller that has not looked cannot
    // claim the hackathon is private.
    it("omits it when the caller says nothing", () => {
      expect(hasInvitesEntry()).toBe(false)
    })

    it("offers it on a private one", () => {
      expect(hasInvitesEntry(true)).toBe(true)
    })

    it("changes nothing else about the section", () => {
      expect(
        idsOf(manageNav("hack-1", owner, false, false, 0, true)).filter(
          (id) => id !== "manage:invites",
        ),
      ).toEqual(idsOf(manageNav("hack-1", owner, false, false, 0, false)))
    })

    // Visibility is not a permission: a private hackathon does not hand the
    // section to somebody who was never going to get it.
    it("does not give a participant the section on a private hackathon", () => {
      expect(
        manageNav(
          "hack-1",
          { role: ROLE_MEMBER, isWaiting: false },
          false,
          false,
          0,
          true,
        ),
      ).toEqual([])
    })
  })

  // Tracks are optional, and the entry says so by not being there. An organiser
  // who wants the first one goes through the Tracks card on Settings, which is
  // always drawn — so nothing is unreachable, and a hackathon running without
  // tracks carries no permanent link to a page listing none.
  describe("trackCount", () => {
    const hasTracksEntry = (count?: number) =>
      idsOf(manageNav("hack-1", owner, false, false, count)).includes(
        "manage:tracks",
      )

    it("omits Manage Tracks for a hackathon with no tracks", () => {
      expect(hasTracksEntry(0)).toBe(false)
    })

    // A caller that does not know how many there are must not imply there are
    // some: the sidebar is the only caller that can count them.
    it("omits it when the caller says nothing", () => {
      expect(hasTracksEntry()).toBe(false)
    })

    it("offers it as soon as one exists", () => {
      expect(hasTracksEntry(1)).toBe(true)
    })

    // The rest of the section is the same either way — the count decides one
    // entry, not what an organiser may do.
    it("changes nothing else about the section", () => {
      expect(
        idsOf(manageNav("hack-1", owner, false, false, 2)).filter(
          (id) => id !== "manage:tracks",
        ),
      ).toEqual(idsOf(manageNav("hack-1", owner, false, false, 0)))
    })
  })

  // Casbin's global escape hatch grants an admin `hackathon:write`,
  // `project:write`, `track:write`, `phase:write` and `page:write` on any
  // hackathon, joined or not — the condition mayManageParticipants,
  // mayReviewProjects, mayManageTracks, mayManagePhases and mayManagePages all
  // mirror. The teams manage route's own load takes the same owner-or-admin pair.
  //
  // Compared against the owner's list rather than restated, so an entry added
  // above cannot be granted to one of the two and not the other.
  it("offers an admin who never joined exactly what it offers the owner", () => {
    expect(idsOf(manageNav("hack-1", undefined, true))).toEqual(
      idsOf(manageNav("hack-1", owner, false)),
    )
  })

  // Mirrors the backend, which does not consult isWaiting for track:write or
  // phase:write either.
  // Manage Public Page is the one entry a waitlisted owner does not get, because
  // its page answers anyone unconfirmed with a 403 (`canEditHackathon`, enforced
  // in that route's load). Withholding it is the nav keeping its stronger
  // promise — never offer a link that then refuses. Every other entry is offered
  // to a waitlisted owner exactly as to a confirmed one.
  it("withholds only the public-page entry from a waitlisted owner", () => {
    const waiting = idsOf(
      manageNav("hack-1", { role: ROLE_OWNER, isWaiting: true }, false),
    )
    const confirmed = idsOf(manageNav("hack-1", owner, false))

    expect(confirmed).toContain("manage:public")
    expect(waiting).toEqual(confirmed.filter((id) => id !== "manage:public"))
  })

  // The exact paths are the compiler's job — `resolve()` takes SvelteKit's
  // generated Pathname union, so a renamed route fails `tsc`, not this. What is
  // worth pinning is that no entry is a stub and none escapes the hackathon.
  it("points every entry at a route under this hackathon", () => {
    for (const item of manageNav("hack-1", owner, false)) {
      expect(item.href, `${item.id} has no href`).toBeTruthy()
      expect(item.href?.startsWith("/my/hackathon/hack-1/")).toBe(true)
    }
  })

  // Both sections' items go to activeNavId in one call, so their ids must not
  // collide and the deeper Manage route has to win over the member entry it nests
  // under — otherwise Timeline stays lit while you are creating a phase, and Teams
  // while you are assigning them.
  it("does not collide with memberNav, and wins the highlight on its own routes", () => {
    const items = [
      // With a phase, so both Timeline entries exist and can contest each other.
      ...memberNav(
        "hack-1",
        [{ id: "p1", title: "Welcome", visible: true }],
        false,
        false,
        0,
        false,
        1,
      ),
      // With a track, so `/tracks` has an entry to light at all.
      ...manageNav("hack-1", owner, false, false, 1, false, 1),
    ]

    expect(new Set(idsOf(items)).size).toBe(items.length)

    // The participant entry wins on its own route; the Manage entry nested under
    // it wins on that one and everything below it.
    //
    // `as const` so these destructure as tuples: without it the array is
    // `string[][]` and `noUncheckedIndexedAccess` widens both halves to
    // `string | undefined`.
    const cases = [
      ["/my/hackathon/hack-1/participants", "member:participants"],
      ["/my/hackathon/hack-1/participants/manage", "manage:participants"],
      // The waitlist has no entry of its own — it is a tab of the page above,
      // and its route nests under that entry's, so opening it keeps Manage
      // Participants lit rather than nothing at all.
      [
        "/my/hackathon/hack-1/participants/manage/waitlist",
        "manage:participants",
      ],
      // Same for one person's page, whichever tab it was opened from.
      [
        "/my/hackathon/hack-1/participants/manage/user-1",
        "manage:participants",
      ],
      ["/my/hackathon/hack-1/teams/manage", "manage:teams"],
      ["/my/hackathon/hack-1/manage", "manage:settings"],
      // The public page editor has an entry of its own now, so it lights that
      // rather than leaving Settings lit beneath it. It still nests under
      // `/manage`, which is what longest-match has to resolve correctly.
      ["/my/hackathon/hack-1/manage/edit", "manage:public"],
      // Nested under Settings too, but with an entry of its own — longest match
      // is what keeps Settings from swallowing it.
      ["/my/hackathon/hack-1/manage/forms", "manage:forms"],
      // Every form is a tab of that one entry, and each tab's route nests under
      // it — so does each tab's own create and edit form. The entry sits at the
      // section's root precisely so the longest match lands on it rather than on
      // Settings, whichever form is open.
      ["/my/hackathon/hack-1/manage/forms/registration", "manage:forms"],
      ["/my/hackathon/hack-1/manage/forms/registration/new", "manage:forms"],
      [
        "/my/hackathon/hack-1/manage/forms/registration/q1/edit",
        "manage:forms",
      ],
      ["/my/hackathon/hack-1/timeline", "member:timeline"],
      ["/my/hackathon/hack-1/timeline/manage", "manage:timeline"],
      // The create and edit forms live under the manage route precisely so they
      // light Manage Timeline rather than the participant Timeline they used to
      // sit beside.
      ["/my/hackathon/hack-1/timeline/manage/new", "manage:timeline"],
      ["/my/hackathon/hack-1/timeline/manage/ph1/edit", "manage:timeline"],
      ["/my/hackathon/hack-1/tracks", "manage:tracks"],
      // A project's detail route nests under whichever list it was opened from,
      // so the sidebar keeps saying which half of the split you are in while you
      // read the proposal.
      ["/my/hackathon/hack-1/projects", "member:projects"],
      ["/my/hackathon/hack-1/projects/pr1", "member:projects"],
      ["/my/hackathon/hack-1/projects/manage", "manage:projects"],
      ["/my/hackathon/hack-1/projects/manage/pr1", "manage:projects"],
      // Pages nest the other way round: the Manage entry is the *parent* of the
      // individual page routes, so opening a page must light that page and not
      // Manage Pages, which only wins on its own index.
      ["/my/hackathon/hack-1/pages", "manage:pages"],
      ["/my/hackathon/hack-1/pages/p1", "member:page:p1"],
    ] as const

    for (const [path, expected] of cases) {
      expect(activeNavId(path, items), path).toBe(expected)
    }

    // A team's detail route lights nothing: it is entered from the ballot, and
    // there is no participant Teams entry for it to light. Manage Teams must not
    // pick it up either — it nests under `/teams/manage`, and a voter reading an
    // entry is not managing anything.
    expect(activeNavId("/my/hackathon/hack-1/teams/t1", items)).toBeUndefined()
  })
})

describe("platformNav", () => {
  // An organiser's one permission, hackathon:create, is a hackathon action, so
  // Platform has nothing to show them — not even a heading.
  it("is empty for a non-admin", () => {
    expect(platformNav({ isGlobalAdmin: false })).toEqual([])
  })

  // Keeps the two loops below from passing vacuously on an empty list.
  it("offers an admin something", () => {
    expect(platformNav({ isGlobalAdmin: true }).length).toBeGreaterThan(0)
  })

  // The dashboard renders these as tiles that give each entry a line of its own,
  // so an entry without a description leaves a visibly empty one. The sidebar
  // ignores the field, which is exactly why nothing else would catch this.
  it("describes every entry, for the surfaces that show descriptions", () => {
    for (const item of platformNav({ isGlobalAdmin: true })) {
      expect(item.description, `${item.id} has no description`).toBeTruthy()
    }
  })

  // Every entry points somewhere: the tiles render an hrefless one as a muted,
  // non-clickable card, which is right as a fallback but wrong as a resting state.
  it("points every entry at a real route", () => {
    for (const item of platformNav({ isGlobalAdmin: true })) {
      expect(item.href, `${item.id} has no href`).toBeTruthy()
    }
  })
})
