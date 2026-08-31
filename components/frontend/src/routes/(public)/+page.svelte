<script lang="ts">
    import {
        Users,
        Lightbulb,
        Mail,
        Upload,
        Vote,
    } from 'lucide-svelte';
    import HackathonRow from '$lib/components/hackathon/HackathonRow.svelte';
    import CtaSection from '$lib/components/hackathon/CtaSection.svelte';
    import { statusLabel, statusBadgeVariant, isFinished } from '$lib/utils/hackathonStatus';
    import { formatDateRange } from '$lib/utils/hackathonDates';
    import { HACKATHON_CONTACT_EMAIL, HACKATHON_CONTACT_MAILTO } from '$lib/utils/contact';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    type Hackathon = PageData['hackathons'][number];

    // `status` is computed server-side from the dates (`mappers.go`
    // computeHackathonStatus), so FINISHED is the only thing that means "over".
    // PENDING covers both "starts later" and "no dates set yet", and ACTIVE is
    // running right now — neither belongs under Past.
    //
    // Both groups are re-sorted here because the backend returns every public
    // hackathon oldest-created-first, which is insertion order and tells a
    // reader nothing. Sorting client-side is safe only while the whole list
    // arrives in one response; if List ever paginates, the order has to move
    // server-side.
    const time = (d?: Date) => d?.getTime();

    // Soonest first. An undated hackathon sorts last — there is no date on which
    // to promise it.
    const upcoming = $derived(
        data.hackathons
            .filter((h) => !isFinished(h.status))
            // `.sort` in place is safe: `.filter` above already returned a new
            // array, so `data.hackathons` is untouched.
            .sort((a, b) => (time(a.startsAt) ?? Infinity) - (time(b.startsAt) ?? Infinity)),
    );

    // Most recently finished first, so the newest history is at the top.
    const past = $derived(
        data.hackathons
            .filter((h) => isFinished(h.status))
            .sort(
                (a, b) =>
                    (time(b.endsAt ?? b.startsAt) ?? 0) - (time(a.endsAt ?? a.startsAt) ?? 0),
            ),
    );

    // See DashboardView for why these are token-derived rather than palette steps.
    const GRADIENTS = [
        { from: 'var(--color-accent)', to: 'color-mix(in oklab, var(--color-accent) 35%, black)' },
        { from: 'var(--color-info)', to: 'color-mix(in oklab, var(--color-info) 35%, black)' },
        {
            from: 'var(--color-success)',
            to: 'color-mix(in oklab, var(--color-success) 35%, black)',
        },
    ];

    function gradient(i: number) {
        return GRADIENTS[i % GRADIENTS.length]!;
    }

    // Organisations that have run a hackathon with us. Deliberately not SDSC,
    // ETH or EPFL, which stood here before: SDSC *is* the ETH/EPFL joint
    // venture, so listing them under "Trusted by" is listing ourselves. They
    // keep their proper billing in AppFooter's "A joint venture of" row.
    //
    // A dark asset where one is needed, and no `invert` fallback — the rule the
    // institution logos relied on does not survive a coloured mark. Inverting
    // J&J's red gives cyan; inverting Richemont's navy gives pale orange.
    const TRUSTED_BY = [
        {
            name: 'Johnson & Johnson',
            // Red reads on both canvases, so one asset serves both.
            logoUrl: '/images/logos/johnson-and-johnson.webp',
        },
        {
            name: 'Richemont',
            // Navy all but vanishes on the dark canvas, so this one ships as a
            // light/dark pair — the same failure that made Durham University
            // invisible on the experimental branch.
            logoUrl: '/images/logos/richemont.webp',
            logoDarkUrl: '/images/logos/richemont-white.webp',
        },
    ];

</script>

<!-- Hero (full-bleed width) -->
<section
    class="relative flex min-h-[30rem] flex-col items-center justify-center gap-6 overflow-hidden
           px-4 pt-8 pb-12 text-center sm:px-10 md:px-20"
>
    <img
        src="/images/hackathon-ord-2024/ambiance/ambiance_1.webp"
        alt=""
        class="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40 dark:opacity-25"
    />
    <div class="pointer-events-none absolute inset-0 bg-canvas/65"></div>

    <div class="relative z-10 flex flex-col items-center gap-6">
        <h1 class="max-w-2xl text-5xl font-bold leading-tight">
            SDSC Hackathon Platform
        </h1>

        <!-- Reads on from the h1 rather than restating it, so the two lines
             are one sentence: "SDSC Hackathon Platform for running professional
             hackathons — …". Hence the lowercase opening. -->
        <p class="max-w-xl text-base leading-relaxed text-ink-2">
            for running professional hackathons — from registration, project
            proposal, team formation, voting and showcasing the results.
        </p>

        <p class="max-w-xl text-base leading-relaxed text-ink-2">
            Want to organise your own hackathon with SDSC?
        </p>

        <!-- One button, because this page has one action. A `Browse Hackathons`
             button stood here jumping to the hackathon list, which is the very next
             section — it promised browsing and delivered a scroll, and being a
             second `btn-solid` for a different action it broke the theme's one
             -solid-per-view rule against the CTA at the foot. The list speaks
             for itself directly below. -->
        <!-- eslint-disable svelte/no-navigation-without-resolve -- mailto, not a route -->
        <a href={HACKATHON_CONTACT_MAILTO} class="btn btn-solid no-underline">
            <Mail class="h-3.5 w-3.5 opacity-60" />
            Contact us
        </a>
        <!-- eslint-enable svelte/no-navigation-without-resolve -->

        <!-- The address written out, because `mailto:` is not reliable: it only
             opens something if the visitor's OS has a mail handler AND that
             handler is configured. Where it is not, the browser drops the
             navigation silently — no error, no dialog, nothing — and a button
             that is the only route to us becomes a dead end. Printed here, the
             address survives that: it can be read and copied either way.
             `select-all` so one click takes the whole address, not a word. -->
        <p class="text-xs text-ink-3">
            or email
            <!-- eslint-disable svelte/no-navigation-without-resolve -- mailto, not a route -->
            <a href={HACKATHON_CONTACT_MAILTO} class="select-all font-mono text-ink-2">
                {HACKATHON_CONTACT_EMAIL}
            </a>
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
        </p>
    </div>
</section>

<div class="mx-auto w-full max-w-7xl">
<!-- The hackathon list, split in two. This heading used to read "Trending
     this month" above a single list that was neither ranked nor filtered by
     date, over a one-tab `chip` strip left behind when its sibling tabs were
     removed. Upcoming and past is a split the data can actually answer.
     Each group renders only when it holds something, so a fresh instance shows
     one honest line rather than two empty headings. -->
<section id="hackathons" class="px-4 py-12 sm:px-10 md:px-20">
    {#if data.hackathons.length === 0}
        <h2 class="text-title">Hackathons</h2>
        <p class="py-6 text-sm text-ink-3">No hackathons available yet.</p>
    {:else}
        {#if upcoming.length > 0}
            <!-- Not "Upcoming": an ACTIVE hackathon is running right now, and
                 calling that upcoming would be the same kind of untruth as the
                 heading this replaced. Each row's badge still says which. -->
            <h2 class="text-title">Current &amp; upcoming</h2>
            {@render rows(upcoming)}
        {/if}

        {#if past.length > 0}
            <h2 class="text-title {upcoming.length > 0 ? 'mt-12' : ''}">Past</h2>
            {@render rows(past)}
        {/if}
    {/if}
</section>

{#snippet rows(items: Hackathon[])}
    <div class="mt-6 divide-y divide-line">
        {#each items as h, i (h.id)}
            <HackathonRow
                href="/hackathon/{h.id}"
                name={h.name}
                meta={formatDateRange(h)}
                badge={statusLabel(h.status)}
                badgeVariant={statusBadgeVariant(h.status)}
                gradFrom={gradient(i).from}
                gradTo={gradient(i).to}
            />
        {/each}
    </div>
{/snippet}

<!-- Features -->
<section class="bg-raised px-4 py-12 sm:px-10 md:px-20">
    <div class="flex flex-col items-center gap-2 text-center">
        <h2 class="text-display">The SDSC platform for professional hackathons</h2>
        <p class="text-base text-ink-3">
            Everything you need to run or participate in a hackathon.
        </p>
    </div>

    <div class="mt-6 grid grid-cols-2 gap-4">
        {#each [
            { icon: Lightbulb, title: 'Propose & discover projects', desc: 'Submit project ideas, browse proposals from other participants, and find the challenge that matches your skills.' },
            { icon: Upload, title: 'Submit & showcase work', desc: 'Submit your project with links, repos, slides and demos. Draft and iterate before the final deadline.' },
            { icon: Users, title: 'Smart team formation', desc: 'Rank your project preferences and get matched into balanced teams. Organizers can fine-tune assignments.' },
            { icon: Vote, title: 'Vote & leaderboard', desc: 'Participants and jury vote on submissions. Results are aggregated into a live leaderboard with configurable scoring.' },
        ] as feat, i (i)}
            {@const Icon = feat.icon}
            <div
                class="card flex flex-col gap-3 p-5"
            >
                <Icon class="h-6 w-6 text-accent-ink" />
                <h3 class="text-section">{feat.title}</h3>
                <p class="text-sm leading-relaxed text-ink-3">{feat.desc}</p>
            </div>
        {/each}
    </div>
</section>

<!-- Orgs -->
<section class="flex flex-col items-center gap-8 px-4 py-12 sm:px-10 md:px-20">
    <h2 class="text-title">Trusted by</h2>
    <!-- Sized by height with the width left to follow, rather than each logo
         dropped into one shared box. Both of these are wide wordmarks — 10.6:1
         and 16.1:1 — and a fixed 112x28 box fits them by width, which put
         Richemont at a 5px cap height. Matching cap heights is what makes a
         logo row look even anyway.

         Unlinked on purpose: AppFooter's rule is that an off-site href is read
         from the source rather than guessed, and a wrong link on a customer's
         logo is worse than no link. -->
    <div class="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
        {#each TRUSTED_BY as org (org.name)}
            <div class="flex h-4 items-center sm:h-5">
                {#if org.logoDarkUrl}
                    <img
                        src={org.logoUrl}
                        alt={org.name}
                        class="block h-full w-auto max-w-full dark:hidden"
                    />
                    <img
                        src={org.logoDarkUrl}
                        alt={org.name}
                        class="hidden h-full w-auto max-w-full dark:block"
                    />
                {:else}
                    <img src={org.logoUrl} alt={org.name} class="h-full w-auto max-w-full" />
                {/if}
            </div>
        {/each}
    </div>
</section>

<!-- The hero's ask restated for anyone who read the whole page, so it lands
     on the same inbox. No `external`: `target="_blank"` on a `mailto:` leaves an
     orphan blank tab behind, and the "opens in a new tab" label it adds would
     not be true. `note` carries the address for the same reason the hero prints
     it — a browser with no mail handler drops the click in silence. -->
<CtaSection
    heading="Want to organise your own hackathon with SDSC?"
    subtitle="SDSC provides the platform, tools, and expertise. Bring your challenge — we'll help you run it."
    buttonLabel="Contact us"
    buttonHref={HACKATHON_CONTACT_MAILTO}
    note={HACKATHON_CONTACT_EMAIL}
/>

</div>
