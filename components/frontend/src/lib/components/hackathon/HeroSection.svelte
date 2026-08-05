<script lang="ts">
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
        dates: string;
        venue: string;
        imageUrl?: string;
        status: string;
        registered: number;
        capacity: number;
        breadcrumbs: { label: string; href: string }[];
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
            <span class="flex min-w-0 items-center gap-2">
                <Calendar class="h-4 w-4 shrink-0 text-accent-ink" />
                {dates}
            </span>
            <span class="flex min-w-0 items-center gap-2">
                <MapPin class="h-4 w-4 shrink-0 text-accent-ink" />
                {venue}
            </span>
            <span class="flex min-w-0 items-center gap-2">
                <Users class="h-4 w-4 shrink-0 text-accent-ink" />
                {registered} / {capacity} registered
            </span>
        </div>
    </div>
</section>
