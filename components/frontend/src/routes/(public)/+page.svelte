<script lang="ts">
    import {
        Code,
        Users,
        Lightbulb,
        Mail,
        Upload,
        Vote,
    } from 'lucide-svelte';
    import HackathonRow from '$lib/components/hackathon/HackathonRow.svelte';
    import CtaSection from '$lib/components/hackathon/CtaSection.svelte';
    import { statusLabel, statusBadgeVariant } from '$lib/utils/hackathonStatus';
    import { formatDateRange } from '$lib/utils/hackathonDates';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

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

    // Same shape and light/dark handling as OrganizersSection: a dark asset when
    // one exists, otherwise invert the light-on-transparent source. Only these
    // three have logo assets in static/ today.
    const INSTITUTIONS = [
        {
            name: 'SDSC',
            url: 'https://datascience.ch',
            logoUrl: '/logos/sdsc.svg',
            logoDarkUrl: '/logos/sdsc_white.svg',
        },
        { name: 'ETH Zurich', url: 'https://ethz.ch', logoUrl: '/images/logos/eth-zurich.svg' },
        { name: 'EPFL', url: 'https://epfl.ch', logoUrl: '/images/logos/epfl.svg' },
    ];

    // Matches AppFooter's LOGO_LINK.
    const LOGO_LINK = 'no-underline opacity-80 transition-opacity hover:opacity-100';

    // Both asks on this page — the hero's and the one at the foot — reach the
    // hackathon team directly, rather than the general web form AppFooter's
    // "Contact" points at: someone asking here has a hackathon in mind, and the
    // reply should come from the people who run them.
    const HACKATHON_CONTACT_EMAIL = 'hackathon@datascience.ch';
    const HACKATHON_CONTACT_MAILTO = `mailto:${HACKATHON_CONTACT_EMAIL}`;
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
<!-- Trending -->
<section id="trending" class="px-4 py-12 sm:px-10 md:px-20">
    <h2 class="text-title">Trending this month</h2>

    <div class="mt-6 flex gap-1 border-b border-line">
        <button class="chip chip-active">
            <Code class="h-3.5 w-3.5" />
            <span>Hackathons</span>
        </button>
    </div>

    <div class="mt-0 divide-y divide-line">
        {#if data.hackathons.length === 0}
            <p class="py-6 text-sm text-ink-3">No hackathons available yet.</p>
        {:else}
            {#each data.hackathons as h, i (h.id)}
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
        {/if}
    </div>
</section>

<!-- Features -->
<section class="bg-raised px-4 py-12 sm:px-10 md:px-20">
    <div class="flex flex-col items-center gap-2 text-center">
        <h2 class="text-display">The hackathon platform for science</h2>
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
    <h2 class="text-title">Trusted by Swiss research institutions</h2>
    <div class="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
        {#each INSTITUTIONS as org, i (i)}
            <!-- eslint-disable svelte/no-navigation-without-resolve -- off-site institution URL -->
            <a
                href={org.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="{org.name} (opens in a new tab)"
                class="flex h-7 w-28 items-center justify-center {LOGO_LINK}"
            >
                {#if org.logoDarkUrl}
                    <img
                        src={org.logoUrl}
                        alt={org.name}
                        class="block max-h-full max-w-full object-contain dark:hidden"
                    />
                    <img
                        src={org.logoDarkUrl}
                        alt={org.name}
                        class="hidden max-h-full max-w-full object-contain dark:block"
                    />
                {:else}
                    <img
                        src={org.logoUrl}
                        alt={org.name}
                        class="max-h-full max-w-full object-contain invert dark:invert-0"
                    />
                {/if}
            </a>
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
        {/each}
    </div>
</section>

<!-- The hero's ask restated for anyone who read the whole page, so it lands
     on the same inbox. No `external`: `target="_blank"` on a `mailto:` leaves an
     orphan blank tab behind, and the "opens in a new tab" label it adds would
     not be true. `note` carries the address for the same reason the hero prints
     it — a browser with no mail handler drops the click in silence. -->
<CtaSection
    heading="Want to host your own hackathon?"
    subtitle="SDSC provides the platform, tools, and expertise. Bring your challenge — we'll help you run it."
    buttonLabel="Contact us"
    buttonHref={HACKATHON_CONTACT_MAILTO}
    note={HACKATHON_CONTACT_EMAIL}
/>

</div>
