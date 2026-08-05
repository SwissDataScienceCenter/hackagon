<script lang="ts">
    // See HackathonRow: resolve() is typed against the route tree.
    import type { Pathname } from '$app/types';
    import { resolve } from '$app/paths';
    import { Calendar, MapPin, Users } from 'lucide-svelte';

    let {
        title,
        dates,
        venue,
        imageUrl,
        status,
        registered,
        capacity,
        breadcrumbs,
    }: {
        title: string;
        /** Formatted range, or empty when the event has no dates yet. */
        dates?: string;
        /**
         * Venue and capacity are OPTIONAL because the backend does not model
         * either one. They were required props filled with literals — "ETH
         * Zurich, Zurich", "42 / 100 registered" — on every event alike, which
         * is worse than an absent line: a stranger reads it as this event's
         * venue. Each renders only when a caller has something true to pass.
         */
        venue?: string;
        imageUrl?: string;
        status: string;
        registered?: number;
        capacity?: number;
        breadcrumbs: { label: string; href: Pathname }[];
    } = $props();
</script>

<section
    class="relative flex min-h-96 flex-col justify-end gap-4 overflow-hidden px-4 pt-8 pb-12
           sm:px-10 md:px-20"
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

        <span class="badge badge-outline-accent w-fit">
            <span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
            <span>{status}</span>
        </span>

        <h1
            class="max-w-2xl text-3xl font-bold leading-tight whitespace-pre-line sm:text-4xl"
        >
            {title}
        </h1>

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
            {#if registered !== undefined}
                <span class="flex min-w-0 items-center gap-2">
                    <Users class="h-4 w-4 shrink-0 text-accent-ink" />
                    {capacity === undefined
                        ? `${registered} registered`
                        : `${registered} / ${capacity} registered`}
                </span>
            {/if}
        </div>
    </div>
</section>
