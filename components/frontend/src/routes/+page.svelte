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
        ChevronLeft,
        ChevronRight,
    } from 'lucide-svelte';
    import HackathonRow from '$lib/components/hackathon/HackathonRow.svelte';
    import CtaSection from '$lib/components/hackathon/CtaSection.svelte';

    let carouselIndex = $state(0);
    const carouselSlides = [
        { src: '/images/hackathon-ord-2024/ambiance/ambiance_1.jpg', caption: 'ORD Hackathon 2024 — Opening ceremony' },
        { src: '/images/hackathon-ord-2024/teams/teams_1.jpg', caption: 'ORD Hackathon 2024 — Team collaboration' },
        { src: '/images/hackathon-ord-2024/ambiance/ambiance_3.jpg', caption: 'ORD Hackathon 2024 — Working sessions' },
        { src: '/images/hackathon-ord-2024/winners/winners_1.jpg', caption: 'ORD Hackathon 2024 — Award ceremony' },
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
        src="/images/hackathon-ord-2024/ambiance/ambiance_1.jpg"
        alt=""
        class="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40 dark:opacity-25"
    />
    <div class="pointer-events-none absolute inset-0 bg-surface-50/70 dark:bg-surface-950/65"></div>

    <div class="relative z-10 flex flex-col items-center gap-6">
        <span class="badge preset-outlined-primary-500">
            <span class="h-1.5 w-1.5 rounded-full bg-primary-500"></span>
            <span>ORD Hackathon 2026 — Registration open</span>
        </span>

        <h1 class="max-w-2xl text-5xl font-bold leading-tight">
            SDSC Hackathon Platform
        </h1>

        <p class="max-w-xl text-base leading-relaxed text-surface-600-400">
            Propose projects, form teams, and build solutions together.
            Hosted by SDSC for the Swiss scientific community.
        </p>

        <div class="flex items-center gap-3">
            <a
                href={resolve('/hackathon/ord-2026')}
                class="btn preset-filled-primary-500 no-underline"
            >
                Get Started
            </a>
            <a href="#trending" class="btn preset-outlined-surface-200-800 no-underline">
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
        <h2 class="text-xl font-bold">Trending this month</h2>
        <a href={resolve('/')} class="text-sm text-primary-500 no-underline">Browse all →</a>
    </div>

    <div class="mt-6 flex gap-1 border-b border-surface-200-800">
        <button class="chip preset-tonal-primary border-b-2 border-primary-500">
            <Code class="h-3.5 w-3.5" />
            <span>Hackathons</span>
        </button>
        <button class="chip hover:preset-tonal">
            <Trophy class="h-3.5 w-3.5" />
            <span>Challenges</span>
        </button>
        <button class="chip hover:preset-tonal">
            <Archive class="h-3.5 w-3.5" />
            <span>Past Events</span>
        </button>
    </div>

    <div class="mt-0 divide-y divide-surface-200-800">
        {#each [
            { name: 'ORD Hackathon 2026', org: 'SDSC', meta: '24 – 25 Oct 2026  ·  ETH Zurich  ·  42 registered', badge: 'Registration Open', badgePreset: 'preset-tonal-primary', count: '42', gradFrom: 'var(--color-primary-700)', gradTo: 'var(--color-primary-950)', slug: 'ord-2026' },
            { name: 'Generative AI for Science', org: 'SDSC', meta: '14 – 15 Nov 2026  ·  EPFL, Lausanne', badge: 'Upcoming', badgePreset: 'preset-tonal-secondary', count: '—', gradFrom: 'var(--color-secondary-500)', gradTo: 'var(--color-secondary-950)', slug: 'genai-2026' },
            { name: 'Global Wheat Challenge 2026', org: 'SDSC', meta: '1 Sep – 30 Nov 2026  ·  Online  ·  87 registered', badge: 'Registration Open', badgePreset: 'preset-tonal-primary', count: '87', gradFrom: 'var(--color-warning-600)', gradTo: 'var(--color-warning-950)', slug: 'wheat-2026' },
            { name: 'Climate Data Challenge 2025', org: 'SDSC', meta: '5 – 6 Jun 2025  ·  Univ. of Bern  ·  64 participants', badge: 'Completed', badgePreset: 'preset-tonal-surface', count: '64', gradFrom: 'var(--color-tertiary-500)', gradTo: 'var(--color-tertiary-950)', slug: 'climate-2025' },
            { name: 'ORD Hackathon 2025', org: 'SDSC', meta: '18 – 19 Oct 2025  ·  ETH Zurich  ·  78 participants', badge: 'Completed', badgePreset: 'preset-tonal-surface', count: '78', gradFrom: 'var(--color-primary-700)', gradTo: 'var(--color-primary-950)', slug: 'ord-2025' },
        ] as row, i (i)}
            <HackathonRow
                href="/hackathon/{row.slug}"
                name={row.name}
                org={row.org}
                meta={row.meta}
                badge={row.badge}
                badgePreset={row.badgePreset}
                count={row.count}
                gradFrom={row.gradFrom}
                gradTo={row.gradTo}
            />
        {/each}
    </div>
</section>

<!-- Winners -->
<section class="px-4 py-12 sm:px-10 md:px-20">
    <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold">Award-winning projects</h2>
        <a href={resolve('/')} class="text-sm text-primary-500 no-underline">See all →</a>
    </div>

    <div class="mt-6 grid grid-cols-3 gap-4">
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
<section class="px-4 py-12 sm:px-10 md:px-20">
    <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold">Event showcase</h2>
        <div class="flex items-center gap-2">
            <button onclick={prevSlide} class="btn-icon btn-sm preset-outlined-surface-200-800">
                <ChevronLeft class="h-4 w-4" />
            </button>
            <button onclick={nextSlide} class="btn-icon btn-sm preset-outlined-surface-200-800">
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
    </div>

    <div class="mt-4 flex justify-center gap-1.5">
        {#each carouselSlides as slide, i (i)}
            <button
                onclick={() => carouselIndex = i}
                class="h-1.5 w-1.5 rounded-full transition-colors {i === carouselIndex
                    ? 'bg-primary-500'
                    : 'bg-surface-300-700'}"
                aria-label="Go to slide: {slide.caption}"
            ></button>
        {/each}
    </div>
</section>

<!-- Features -->
<section class="bg-surface-100-900 px-4 py-12 sm:px-10 md:px-20">
    <div class="flex flex-col items-center gap-2 text-center">
        <h2 class="text-2xl font-bold">The hackathon platform for science</h2>
        <p class="text-base text-surface-500">
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
    <h2 class="text-xl font-bold">Trusted by Swiss research institutions</h2>
    <div class="flex items-center gap-12">
        {#each ['SDSC', 'ETH Zurich', 'EPFL', 'Univ. of Bern', 'Univ. of Zurich', 'SOAD'] as name, i (i)}
            <div class="flex flex-col items-center gap-2">
                <div class="h-14 w-14 preset-outlined-surface-200-800 flex items-center justify-center"></div>
                <span class="text-xs font-medium text-surface-500">{name}</span>
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
