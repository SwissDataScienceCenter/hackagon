<script lang="ts">
    import { resolve } from '$app/paths';
    import {
        ArrowRight,
        Code,
        Trophy,
        Users,
        Lightbulb,
        Upload,
        Vote,
        ChevronLeft,
        ChevronRight,
    } from 'lucide-svelte';
    import HackathonRow from '$lib/components/hackathon/HackathonRow.svelte';
    import CtaSection from '$lib/components/hackathon/CtaSection.svelte';
    import { statusLabel, statusBadgeVariant } from '$lib/utils/hackathonStatus';
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

    let carouselIndex = $state(0);
    const carouselSlides = [
        { src: '/images/hackathon-ord-2024/ambiance/ambiance_1.webp', caption: 'ORD Hackathon 2024 — Opening ceremony' },
        { src: '/images/hackathon-ord-2024/teams/teams_1.webp', caption: 'ORD Hackathon 2024 — Team collaboration' },
        { src: '/images/hackathon-ord-2024/ambiance/ambiance_3.webp', caption: 'ORD Hackathon 2024 — Working sessions' },
        { src: '/images/hackathon-ord-2024/winners/winners_1.webp', caption: 'ORD Hackathon 2024 — Award ceremony' },
    ];

    function nextSlide() {
        carouselIndex = (carouselIndex + 1) % carouselSlides.length;
    }
    function prevSlide() {
        carouselIndex = (carouselIndex - 1 + carouselSlides.length) % carouselSlides.length;
    }
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
        <span class="badge badge-outline-accent">
            <span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
            <span>ORD Hackathon 2026 — Registration open</span>
        </span>

        <h1 class="max-w-2xl text-5xl font-bold leading-tight">
            SDSC Hackathon Platform
        </h1>

        <p class="max-w-xl text-base leading-relaxed text-ink-2">
            Propose projects, form teams, and build solutions together.
            Hosted by SDSC for the Swiss scientific community.
        </p>

        <div class="flex items-center gap-3">
            <a
                href={resolve('/hackathon/ord-2026')}
                class="btn btn-solid no-underline"
            >
                Get Started
            </a>
            <a href="#trending" class="btn btn-outline no-underline">
                Browse Hackathons
                <ArrowRight class="h-3.5 w-3.5 opacity-60" />
            </a>
        </div>
    </div>
</section>

<div class="mx-auto w-full max-w-7xl">
<!-- Trending -->
<section id="trending" class="px-4 py-12 sm:px-10 md:px-20">
    <div class="flex items-center justify-between">
        <h2 class="text-title">Trending this month</h2>
        <a href={resolve('/')} class="text-sm text-accent-ink no-underline">Browse all →</a>
    </div>

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
                    meta={formatMeta(h)}
                    badge={statusLabel(h.status)}
                    badgeVariant={statusBadgeVariant(h.status)}
                    gradFrom={gradient(i).from}
                    gradTo={gradient(i).to}
                />
            {/each}
        {/if}
    </div>
</section>

<!-- Winners -->
<section class="px-4 py-12 sm:px-10 md:px-20">
    <div class="flex items-center justify-between">
        <h2 class="text-title">Award-winning projects</h2>
        <a href={resolve('/')} class="text-sm text-accent-ink no-underline">See all →</a>
    </div>

    <div class="mt-6 grid grid-cols-3 gap-4">
        {#each [
            { hackathon: 'ORD Hackathon 2025', project: 'AutoORD: Automated\nResearch Data Pipelines', team: 'by Team DataFlow', summary: 'Automated pipeline for converting raw research data into FAIR-compliant open datasets.' },
            { hackathon: 'GenAI Hackathon 2025', project: 'GenomeLens', team: 'by BioViz Crew', summary: 'Interactive visualization of genomic variants powered by generative models.' },
            { hackathon: 'Climate Data 2025', project: 'ClimateQA', team: 'by Green Bytes', summary: 'RAG-based Q&A trained on Swiss climate data, making decades of measurements queryable.' },
        ] as card, i (i)}
            <div class="card overflow-hidden">
                <div
                    class="flex h-10 items-center justify-between border-b border-line px-4"
                >
                    <div class="flex items-center gap-1.5 text-warning-ink">
                        <Trophy class="h-3.5 w-3.5" />
                        <span class="text-xs font-bold">1st Place</span>
                    </div>
                    <span class="text-xs text-ink-3">{card.hackathon}</span>
                </div>
                <div class="flex flex-col gap-2 p-4">
                    <p class="text-sm font-semibold leading-tight whitespace-pre-line">{card.project}</p>
                    <span class="text-xs text-accent-ink">{card.team}</span>
                    <p class="text-xs leading-snug text-ink-3">{card.summary}</p>
                </div>
            </div>
        {/each}
    </div>
</section>

<!-- Event Showcase Carousel -->
<section class="px-4 py-12 sm:px-10 md:px-20">
    <div class="flex items-center justify-between">
        <h2 class="text-title">Event showcase</h2>
        <div class="flex items-center gap-2">
            <button onclick={prevSlide} class="btn btn-icon btn-sm btn-outline">
                <ChevronLeft class="h-4 w-4" />
            </button>
            <button onclick={nextSlide} class="btn btn-icon btn-sm btn-outline">
                <ChevronRight class="h-4 w-4" />
            </button>
        </div>
    </div>

    <div class="relative mt-6 overflow-hidden">
        <div
            class="flex gap-4 transition-transform duration-500 ease-in-out"
            style="transform: translateX(-{carouselIndex * 25}%)"
        >
            {#each carouselSlides as slide, i (i)}
                <div class="w-[calc(25%-12px)] shrink-0">
                    <div class="relative aspect-video overflow-hidden rounded-card border border-line">
                        <img
                            src={slide.src}
                            alt={slide.caption}
                            class="h-full w-full object-cover"
                        />
                    </div>
                    <p class="mt-2 text-xs text-ink-3">{slide.caption}</p>
                </div>
            {/each}
        </div>
    </div>

    <div class="mt-4 flex justify-center gap-1.5">
        {#each carouselSlides as slide, i (i)}
            <button
                onclick={() => carouselIndex = i}
                class="h-1.5 w-1.5 rounded-full transition-colors {i === carouselIndex
                    ? 'bg-accent'
                    : 'bg-overlay'}"
                aria-label="Go to slide: {slide.caption}"
            ></button>
        {/each}
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
    <div class="flex items-center gap-12">
        {#each ['SDSC', 'ETH Zurich', 'EPFL', 'Univ. of Bern', 'Univ. of Zurich', 'SOAD'] as name, i (i)}
            <div class="flex flex-col items-center gap-2">
                <div class="flex h-14 w-14 items-center justify-center rounded-card border border-line"></div>
                <span class="text-xs font-medium text-ink-3">{name}</span>
            </div>
        {/each}
    </div>
</section>

<CtaSection
    heading="Want to host your own hackathon?"
    subtitle="SDSC provides the platform, tools, and expertise. Bring your challenge — we'll help you run it."
    buttonLabel="Contact Us"
    buttonHref={resolve('/')}
/>

</div>
