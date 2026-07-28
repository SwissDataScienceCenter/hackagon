---
name: frontend-data-wiring
description:
  Conventions for wiring a hackagon frontend route to real backend data (or
  replacing hardcoded/mock content with it). Use whenever adding a
  +page.server.ts, un-mocking a page, or deciding where data-shaping logic for a
  route should live.
---

This repo's frontend (`components/frontend/`) already documents the overall
route-to-backend pattern in the root `CLAUDE.md` ("Frontend route → backend
pattern"). This skill adds the parts that pattern doesn't spell out.

## Always add a route's own `+page.server.ts`

Even if the data a page needs is already available from an ancestor
`+layout.server.ts` (SvelteKit merges parent load data into the child's `data`
prop automatically), still give the route its own `+page.server.ts`. Don't have
the `.svelte` component reach into inherited layout data directly — make the
route's data dependency explicit and typed via its own load function.

## Don't refetch data the parent layout already loaded

If the data is already fetched one level up, call `await event.parent()` inside
the route's `load` and reuse it — do not issue a second gRPC call for data you
already have.

```ts
export const load: PageServerLoad = async (event) => {
  const { hackathon } = await event.parent()
  // shape hackathon into what this page needs
}
```

## Shape data server-side, not in the component

Mapping raw entities into display-ready rows (e.g. `HackathonMember` →
`{id, name, email, roleLabel}`) belongs in the `load` function, not in the
`.svelte` file. The component should just render what `data` gives it (plus
purely presentational client state like search-box filtering).

## Reference implementation

`components/frontend/src/routes/(participant)/hackathon/[slug]/participants/+page.server.ts`
— reuses the hackathon layout's already-fetched member list via
`event.parent()`, maps it to row data using `membershipBadgeLabel` from
`$lib/utils/hackathonStatus`, and returns just `{ participants }`. The matching
`+page.svelte` only does `const participants = $derived(data.participants)` plus
client-side search filtering.

## Background

See `.claude/front-status.md` for the current inventory of which routes are
wired to real backend calls vs. still hardcoded, and
`.claude/frontend-feature-audit.md` for which stubbed features have no backend
counterpart at all yet.
