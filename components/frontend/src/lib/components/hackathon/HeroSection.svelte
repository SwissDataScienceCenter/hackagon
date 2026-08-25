<script lang="ts">
    import { resolve } from '$app/paths';
    import { Calendar, MapPin, Users } from 'lucide-svelte';

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
    class:min-h-96={imageUrl}
>
    {#if imageUrl}
        <img
            src={imageUrl}
            alt=""
            class="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30 dark:opacity-20"
        />
    {/if}
    <!-- One scrim, not a light/dark pair: `canvas` already flips with the mode,
         so the two variants collapse into a single token. -->
    <div class="pointer-events-none absolute inset-0 bg-canvas/70"></div>

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
