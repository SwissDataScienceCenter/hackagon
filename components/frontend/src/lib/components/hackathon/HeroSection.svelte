<script lang="ts">
    import { resolve } from '$app/paths';
    import { Calendar, MapPin, Users } from 'lucide-svelte';
    import { usableImage } from '$lib/utils/imageUrl';

    // Only the name and the breadcrumbs are required. Everything else is
    // optional because a hackathon may genuinely not have it: dates are
    // nullable in the schema, and venue and the registration count have no
    // field at all yet. The alternative — a required prop the caller fills with
    // a plausible-looking constant — is how a page ends up stating a capacity
    // nobody set.
    let {
        title,
        breadcrumbs,
        dates,
        venue,
        imageUrl,
        status,
        registered,
        capacity,
    }: {
        title: string;
        breadcrumbs: { label: string; href: string }[];
        dates?: string;
        venue?: string;
        imageUrl?: string;
        status?: string;
        registered?: number;
        capacity?: number;
    } = $props();

    // The banner is a URL an organiser typed — there is no upload — so a link
    // that serves a web page instead of an image is the ordinary mistake. It
    // has to switch off `min-h-96` as well as the `<img>`: a 24rem band holding
    // a broken image, or nothing at all, is worse than the short hero every
    // hackathon without a logo already gets.
    let failedSrc: string | undefined = $state(undefined);
    const hasImage = $derived(usableImage(imageUrl, failedSrc));

    // Only a pair says anything; one half of it is a fragment, not a fact.
    const hasCounts = $derived(registered !== undefined && capacity !== undefined);
    const hasMeta = $derived(Boolean(dates) || Boolean(venue) || hasCounts);
</script>

<!-- The tall variant is for the image: 24rem of canvas is what gives a banner
     room to read as one. With no image there is nothing filling it, so the
     section falls back to its content's own height. -->
<section
    class="relative flex flex-col justify-end gap-4 overflow-hidden px-4 pt-8 pb-12
           sm:px-10 md:px-20"
    class:min-h-96={hasImage}
>
    <!-- Two dimmers stack here, and it is their product that matters: the image
         at 55% under a 55%-opaque scrim shows about a quarter of itself (0.55 x
         0.45), 18% in dark mode. It was 30% under a 70% scrim — 9% — which is
         not a picture but a faint tint, and read as a rendering fault rather
         than a backdrop. Raise either number alone and the pair drifts apart
         again, so change them together. The same values are on the landing
         page's hero, which is the only other surface doing this. -->
    {#if hasImage}
        <img
            src={imageUrl}
            alt=""
            onerror={() => (failedSrc = imageUrl)}
            class="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-55 dark:opacity-40"
        />
    {/if}
    <!-- One scrim, not a light/dark pair: `canvas` already flips with the mode,
         so the two variants collapse into a single token. -->
    <div class="pointer-events-none absolute inset-0 bg-canvas/55"></div>

    <div class="relative z-10 flex flex-col gap-4">
        <nav class="flex items-center gap-1.5 text-xs text-ink-2">
            {#each breadcrumbs as crumb, i (i)}
                {#if i > 0}
                    <span>/</span>
                {/if}
                <a href={resolve(crumb.href)} class="no-underline hover:text-accent-ink">{crumb.label}</a>
            {/each}
        </nav>

        {#if status}
            <span class="badge badge-outline-accent w-fit">
                <span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
                <span>{status}</span>
            </span>
        {/if}

        <h1
            class="max-w-2xl text-3xl font-bold leading-tight whitespace-pre-line sm:text-4xl"
        >
            {title}
        </h1>

        {#if hasMeta}
            <div
                class="flex flex-col gap-3 text-sm text-ink-2 sm:flex-row sm:flex-wrap
                       sm:items-center sm:gap-6"
            >
                {#if dates}
                    <span class="flex min-w-0 items-center gap-2">
                        <Calendar class="h-4 w-4 shrink-0 text-accent-ink" />
                        {dates}
                    </span>
                {/if}
                {#if venue}
                    <span class="flex min-w-0 items-center gap-2">
                        <MapPin class="h-4 w-4 shrink-0 text-accent-ink" />
                        {venue}
                    </span>
                {/if}
                {#if hasCounts}
                    <span class="flex min-w-0 items-center gap-2">
                        <Users class="h-4 w-4 shrink-0 text-accent-ink" />
                        {registered} / {capacity} registered
                    </span>
                {/if}
            </div>
        {/if}
    </div>
</section>
