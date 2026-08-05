<script lang="ts">
    import { resolve } from '$app/paths';
    import {
        ArrowRight,
        Code,
        Trophy,
        Archive,
        Users,
        Lightbulb,
        Upload,
        Vote,
        Radio,
        CalendarClock,
        ChevronLeft,
        ChevronRight,
    } from 'lucide-svelte';
    import HackathonRow from '$lib/components/hackathon/HackathonRow.svelte';
    import CtaSection from '$lib/components/hackathon/CtaSection.svelte';
    import { statusLabel, statusBadgePreset } from '$lib/utils/hackathonStatus';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    type Listed = PageData['hackathons'][number];

    // HackathonStatus numeric values: PENDING=1, ACTIVE=2, FINISHED=3.
    // Raw numbers on purpose — the generated enum lives under $lib/server.
    const UPCOMING = 1;
    const ACTIVE = 2;
    const FINISHED = 3;

    const GRADIENTS = [
        { from: 'var(--color-primary-700)', to: 'var(--color-primary-950)' },
        { from: 'var(--color-secondary-500)', to: 'var(--color-secondary-950)' },
        { from: 'var(--color-tertiary-500)', to: 'var(--color-tertiary-950)' },
    ];

    function formatMeta(h: { startsAt?: Date; endsAt?: Date }): string {
        const fmt = (d: Date) =>
            d.toLocaleDateString('en-CH', { day: 'numeric', month: 'short', year: 'numeric' });
        if (h.startsAt && h.endsAt) return `${fmt(h.startsAt)} – ${fmt(h.endsAt)}`;
        if (h.startsAt) return `Starts ${fmt(h.startsAt)}`;
        return '';
    }

    function gradient(i: number) {
        return GRADIENTS[i % GRADIENTS.length]!;
    }

    /* ---------------------------------------------------------------- listing */

    const FILTERS = [
        { id: 'all', label: 'All', icon: Code },
        { id: 'live', label: 'Live now', icon: Radio },
        { id: 'upcoming', label: 'Upcoming', icon: CalendarClock },
        { id: 'past', label: 'Past events', icon: Archive },
    ] as const;

    type FilterId = (typeof FILTERS)[number]['id'];

    function matches(id: FilterId, h: Listed): boolean {
        if (id === 'live') return h.status === ACTIVE;
        if (id === 'upcoming') return h.status === UPCOMING;
        if (id === 'past') return h.status === FINISHED;
        return true;
    }

    function countFor(id: FilterId): number {
        return data.hackathons.filter((h) => matches(id, h)).length;
    }

    /** Live first, then upcoming, then finished. */
    const RANK: Partial<Record<number, number>> = { [ACTIVE]: 0, [UPCOMING]: 1, [FINISHED]: 2 };

    /** Most relevant first: live, then soonest upcoming, then most recently finished. */
    function byRelevance(a: Listed, b: Listed): number {
        const rankA = RANK[a.status] ?? 9;
        const rankB = RANK[b.status] ?? 9;
        if (rankA !== rankB) return rankA - rankB;
        const startA = a.startsAt?.getTime() ?? 0;
        const startB = b.startsAt?.getTime() ?? 0;
        return a.status === UPCOMING ? startA - startB : startB - startA;
    }

    const PREVIEW_COUNT = 5;

    let activeFilter = $state<FilterId>('all');
    let showAll = $state(false);

    const ranked = $derived([...data.hackathons].sort(byRelevance));
    const filtered = $derived(ranked.filter((h) => matches(activeFilter, h)));
    const shown = $derived(showAll ? filtered : filtered.slice(0, PREVIEW_COUNT));
    const activeLabel = $derived(FILTERS.find((f) => f.id === activeFilter)?.label ?? 'All');

    /** Hero CTA target: the most relevant hackathon we actually have. */
    const featured = $derived(ranked[0]);

    function selectFilter(id: FilterId) {
        activeFilter = id;
        showAll = false;
    }

    function heroNote(status: number): string {
        if (status === ACTIVE) return 'Happening now';
        if (status === UPCOMING) return 'Coming up';
        return 'Wrapped up';
    }

    /* --------------------------------------------------------------- showcase */

    const carouselSlides = [
        { src: '/images/hackathon-ord-2024/ambiance/ambiance_1.jpg', caption: 'ORD Hackathon 2024 — Opening ceremony' },
        { src: '/images/hackathon-ord-2024/teams/teams_1.jpg', caption: 'ORD Hackathon 2024 — Team collaboration' },
        { src: '/images/hackathon-ord-2024/ambiance/ambiance_3.jpg', caption: 'ORD Hackathon 2024 — Working sessions' },
        { src: '/images/hackathon-ord-2024/winners/winners_1.jpg', caption: 'ORD Hackathon 2024 — Award ceremony' },
    ];

    // The track itself is the scroller, so touch swipe, the arrows and the dots
    // all drive the same thing and stay in sync. How many slides fit at once
    // depends on the breakpoint, so paging is measured, not hard-coded: one dot
    // per viewport-width page, spread across the real scroll range. That way
    // every dot is reachable and the last one lines up with "next" going dead.
    let track = $state<HTMLDivElement | null>(null);
    let pageCount = $state(1);
    let pageIndex = $state(0);
    let canScrollLeft = $state(false);
    let canScrollRight = $state(false);

    const pages = $derived(Array.from(Array(pageCount).keys()));

    function syncCarousel() {
        if (!track) return;
        const maxScroll = track.scrollWidth - track.clientWidth;
        const pos = track.scrollLeft;
        pageCount = Math.max(1, Math.ceil(track.scrollWidth / track.clientWidth));
        pageIndex = maxScroll <= 1 ? 0 : Math.round((pos / maxScroll) * (pageCount - 1));
        canScrollLeft = pos > 1;
        canScrollRight = pos < maxScroll - 1;
    }

    function goToPage(i: number) {
        if (!track) return;
        const maxScroll = track.scrollWidth - track.clientWidth;
        const clamped = Math.min(Math.max(i, 0), pageCount - 1);
        const left = pageCount > 1 ? (clamped / (pageCount - 1)) * maxScroll : 0;
        track.scrollTo({ left, behavior: 'smooth' });
    }

    function nextSlide() {
        goToPage(pageIndex + 1);
    }
    function prevSlide() {
        goToPage(pageIndex - 1);
    }

    $effect(() => {
        syncCarousel();
    });
</script>

<svelte:window onresize={syncCarousel} />

<!-- Hero (full-bleed width) -->
<section
    class="relative flex min-h-[30rem] flex-col items-center justify-center gap-6 overflow-hidden
           px-4 pt-8 pb-12 text-center sm:px-10 md:px-20"
>
    <img
        src="/images/hackathon-ord-2024/ambiance/ambiance_1.jpg"
        alt=""
        class="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40 dark:opacity-25"
    />
    <div class="pointer-events-none absolute inset-0 bg-surface-50/70 dark:bg-surface-950/65"></div>

    <div class="relative z-10 flex w-full flex-col items-center gap-6">
        {#if featured}
            <span class="badge preset-outlined-primary-500 max-w-full whitespace-normal">
                <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500"></span>
                <span>{featured.name} — {heroNote(featured.status)}</span>
            </span>
        {/if}

        <h1 class="max-w-2xl text-5xl font-bold leading-tight">
            SDSC Hackathon Platform
        </h1>

        <p class="max-w-xl text-base leading-relaxed text-surface-600-400">
            Propose projects, form teams, and build solutions together.
            Hosted by SDSC for the Swiss scientific community.
        </p>

        <div class="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
            {#if featured}
                <!-- Real target: the hackathon the listing below leads with. -->
                <a
                    href={resolve(`/hackathon/${featured.id}`)}
                    class="btn preset-filled-primary-500 no-underline"
                >
                    {featured.status === FINISHED ? 'See the results' : 'Get Started'}
                </a>
                <a href="#trending" class="btn preset-outlined-surface-200-800 no-underline">
                    Browse Hackathons
                    <ArrowRight class="h-3.5 w-3.5 opacity-60" />
                </a>
            {:else}
                <!-- Nothing published yet: send visitors to what the page can show. -->
                <a href="#features" class="btn preset-filled-primary-500 no-underline">
                    See how it works
                    <ArrowRight class="h-3.5 w-3.5 opacity-60" />
                </a>
            {/if}
        </div>
    </div>
</section>

<div class="mx-auto w-full max-w-7xl">
<!-- Trending -->
<section id="trending" class="scroll-mt-20 px-4 py-12 sm:px-10 md:px-20">
    <div class="flex items-center justify-between gap-4">
        <h2 class="text-xl font-bold">Trending this month</h2>
        {#if filtered.length > PREVIEW_COUNT}
            <button
                onclick={() => (showAll = !showAll)}
                class="cursor-pointer text-sm text-primary-500 hover:underline"
            >
                {showAll ? 'Show less' : `Browse all ${filtered.length} →`}
            </button>
        {/if}
    </div>

    <div class="mt-6 flex flex-wrap gap-1 border-b border-surface-200-800">
        {#each FILTERS as filter (filter.id)}
            {@const Icon = filter.icon}
            {@const count = countFor(filter.id)}
            <button
                onclick={() => selectFilter(filter.id)}
                aria-pressed={activeFilter === filter.id}
                class="chip cursor-pointer border-b-2 {activeFilter === filter.id
                    ? 'preset-tonal-primary border-primary-500'
                    : 'border-transparent hover:preset-tonal'}"
            >
                <Icon class="h-3.5 w-3.5" />
                <span>{filter.label}</span>
                <span class="text-xs opacity-60">{count}</span>
            </button>
        {/each}
    </div>

    <div class="mt-0 divide-y divide-surface-200-800">
        {#if data.hackathons.length === 0}
            <p class="py-6 text-sm text-surface-500">No hackathons available yet.</p>
        {:else if shown.length === 0}
            <div class="flex flex-col items-start gap-2 py-6">
                <p class="text-sm text-surface-500">
                    Nothing under “{activeLabel}” right now.
                </p>
                <button
                    onclick={() => selectFilter('all')}
                    class="cursor-pointer text-sm text-primary-500 hover:underline"
                >
                    Show all hackathons →
                </button>
            </div>
        {:else}
            {#each shown as h, i (h.id)}
                <HackathonRow
                    href="/hackathon/{h.id}"
                    name={h.name}
                    meta={formatMeta(h)}
                    badge={statusLabel(h.status)}
                    badgePreset={statusBadgePreset(h.status)}
                    gradFrom={gradient(i).from}
                    gradTo={gradient(i).to}
                />
            {/each}
        {/if}
    </div>
</section>

<!-- Winners -->
<section class="px-4 py-12 sm:px-10 md:px-20">
    <div class="flex items-center justify-between gap-4">
        <h2 class="text-xl font-bold">Award-winning projects</h2>
        {#if countFor('past') > 0}
            <!-- Jumps to the listing with the past-events filter applied. -->
            <a
                href="#trending"
                onclick={() => selectFilter('past')}
                class="text-sm text-primary-500 no-underline hover:underline"
            >
                Past events →
            </a>
        {/if}
    </div>

    <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {#each [
            { hackathon: 'ORD Hackathon 2025', project: 'AutoORD: Automated\nResearch Data Pipelines', team: 'by Team DataFlow', summary: 'Automated pipeline for converting raw research data into FAIR-compliant open datasets.' },
            { hackathon: 'GenAI Hackathon 2025', project: 'GenomeLens', team: 'by BioViz Crew', summary: 'Interactive visualization of genomic variants powered by generative models.' },
            { hackathon: 'Climate Data 2025', project: 'ClimateQA', team: 'by Green Bytes', summary: 'RAG-based Q&A trained on Swiss climate data, making decades of measurements queryable.' },
        ] as card, i (i)}
            <div
                class="card preset-filled-surface-50-950 overflow-hidden border border-surface-200-800"
            >
                <div
                    class="flex h-10 items-center justify-between border-b border-surface-200-800 px-4"
                >
                    <div class="flex items-center gap-1.5 text-warning-500">
                        <Trophy class="h-3.5 w-3.5" />
                        <span class="text-xs font-bold">1st Place</span>
                    </div>
                    <span class="text-xs text-surface-500">{card.hackathon}</span>
                </div>
                <div class="flex flex-col gap-2 p-4">
                    <p class="text-sm font-semibold leading-tight whitespace-pre-line">{card.project}</p>
                    <span class="text-xs text-primary-500">{card.team}</span>
                    <p class="text-xs leading-snug text-surface-500">{card.summary}</p>
                </div>
            </div>
        {/each}
    </div>
</section>

<!-- Event Showcase Carousel -->
<section id="showcase" class="scroll-mt-20 px-4 py-12 sm:px-10 md:px-20">
    <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold">Event showcase</h2>
        <div class="flex items-center gap-2">
            <button
                onclick={prevSlide}
                disabled={!canScrollLeft}
                aria-label="Previous photos"
                class="btn-icon btn-sm preset-outlined-surface-200-800 cursor-pointer
                       disabled:cursor-default disabled:opacity-40"
            >
                <ChevronLeft class="h-4 w-4" />
            </button>
            <button
                onclick={nextSlide}
                disabled={!canScrollRight}
                aria-label="Next photos"
                class="btn-icon btn-sm preset-outlined-surface-200-800 cursor-pointer
                       disabled:cursor-default disabled:opacity-40"
            >
                <ChevronRight class="h-4 w-4" />
            </button>
        </div>
    </div>

    <div
        bind:this={track}
        onscroll={syncCarousel}
        class="mt-6 flex gap-4 overflow-x-auto pb-2
               [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
        {#each carouselSlides as slide, i (i)}
            <div class="w-[85%] shrink-0 sm:w-[48%] lg:w-[31%]">
                <div class="relative aspect-video overflow-hidden preset-outlined-surface-200-800">
                    <img
                        src={slide.src}
                        alt={slide.caption}
                        class="h-full w-full object-cover"
                    />
                </div>
                <p class="mt-2 text-xs text-surface-500">{slide.caption}</p>
            </div>
        {/each}
    </div>

    {#if pageCount > 1}
        <div class="mt-4 flex justify-center gap-1">
            {#each pages as i (i)}
                <button
                    onclick={() => goToPage(i)}
                    class="flex h-6 w-6 cursor-pointer items-center justify-center"
                    aria-label="Show photos, page {i + 1} of {pageCount}"
                    aria-current={i === pageIndex}
                >
                    <span
                        class="h-1.5 w-1.5 rounded-full transition-colors {i === pageIndex
                            ? 'bg-primary-500'
                            : 'bg-surface-300-700'}"
                    ></span>
                </button>
            {/each}
        </div>
    {/if}
</section>

<!-- Features -->
<section id="features" class="scroll-mt-20 bg-surface-100-900 px-4 py-12 sm:px-10 md:px-20">
    <div class="flex flex-col items-center gap-2 text-center">
        <h2 class="text-2xl font-bold">The hackathon platform for science</h2>
        <p class="text-base text-surface-500">
            Everything you need to run or participate in a hackathon.
        </p>
    </div>

    <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {#each [
            { icon: Lightbulb, title: 'Propose & discover projects', desc: 'Submit project ideas, browse proposals from other participants, and find the challenge that matches your skills.' },
            { icon: Upload, title: 'Submit & showcase work', desc: 'Submit your project with links, repos, slides and demos. Draft and iterate before the final deadline.' },
            { icon: Users, title: 'Smart team formation', desc: 'Rank your project preferences and get matched into balanced teams. Organizers can fine-tune assignments.' },
            { icon: Vote, title: 'Vote & leaderboard', desc: 'Participants and jury vote on submissions. Results are aggregated into a live leaderboard with configurable scoring.' },
        ] as feat, i (i)}
            {@const Icon = feat.icon}
            <div
                class="card preset-filled-surface-50-950 flex flex-col gap-3 border
                       border-surface-200-800 p-5"
            >
                <Icon class="h-6 w-6 text-primary-500" />
                <h3 class="text-base font-semibold">{feat.title}</h3>
                <p class="text-sm leading-relaxed text-surface-500">{feat.desc}</p>
            </div>
        {/each}
    </div>
</section>

<!-- Orgs -->
<section class="flex flex-col items-center gap-8 px-4 py-12 sm:px-10 md:px-20">
    <!-- Not "Swiss institutions": Durham is in the UK, so the claim has to be
         wider than the original copy. -->
    <h2 class="text-center text-xl font-bold">Trusted by research institutions</h2>
    <!-- flex-wrap: entries must never force horizontal page overflow on phone
         widths. Logos render only where the asset actually exists; the rest
         show their name alone. -->
    <div class="flex flex-wrap items-end justify-center gap-8">
        {#each [
            { name: 'SDSC', logo: '/logos/sdsc.svg', logoDark: '/logos/sdsc_white.svg' },
            { name: 'ETH Zurich', logo: '/images/logos/eth-zurich.svg' },
            { name: 'EPFL', logo: '/images/logos/epfl.svg' },
            { name: 'Durham University' }
        ] as org (org.name)}
            <div class="flex flex-col items-center gap-2">
                {#if org.logo}
                    <!-- ETH/EPFL svgs are white-native (footer convention):
                         invert for light mode, none for dark. -->
                    <img
                        src={org.logo}
                        alt="{org.name} logo"
                        class="h-10 w-auto {org.logoDark ? 'dark:hidden' : 'invert dark:invert-0'}"
                    />
                    {#if org.logoDark}
                        <img
                            src={org.logoDark}
                            alt="{org.name} logo"
                            class="hidden h-10 w-auto dark:block"
                        />
                    {/if}
                {/if}
                <span class="text-xs font-medium text-surface-500">{org.name}</span>
            </div>
        {/each}
    </div>
</section>

<!-- No contact route or address exists yet, so the CTA points at the section
     that actually answers "what do I get" instead of a dead link. -->
<CtaSection
    heading="Want to host your own hackathon?"
    subtitle="SDSC provides the platform, tools, and expertise. Bring your challenge — we'll help you run it."
    buttonLabel="See how it works"
    buttonHref="#features"
/>

</div>
