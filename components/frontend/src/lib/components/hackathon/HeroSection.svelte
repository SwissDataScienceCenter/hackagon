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

<section class="relative flex min-h-[400px] flex-col justify-end gap-4 overflow-hidden px-20 pb-12 pt-10">
    {#if imageUrl}
        <img
            src={imageUrl}
            alt=""
            class="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30 dark:opacity-20"
        />
    {/if}
    <div class="pointer-events-none absolute inset-0 bg-surface-50/60 dark:bg-surface-950/70"></div>

    <div class="relative z-10 flex flex-col gap-4">
        <nav class="flex items-center gap-1.5 text-xs text-surface-700 dark:text-surface-100">
            {#each breadcrumbs as crumb, i (i)}
                {#if i > 0}
                    <span>/</span>
                {/if}
                <a href={resolve(crumb.href)} class="no-underline hover:text-primary-500">{crumb.label}</a>
            {/each}
        </nav>

        <span class="badge preset-outlined-primary-500 w-fit">
            <span class="h-1.5 w-1.5 rounded-full bg-primary-500"></span>
            <span>{status}</span>
        </span>

        <h1 class="max-w-[700px] text-4xl font-bold leading-tight whitespace-pre-line">{title}</h1>

        <div class="flex items-center gap-6 text-sm text-surface-700 dark:text-surface-100">
            <span class="flex items-center gap-2">
                <Calendar class="h-4 w-4 text-primary-700 dark:text-primary-500" />
                {dates}
            </span>
            <span class="flex items-center gap-2">
                <MapPin class="h-4 w-4 text-primary-700 dark:text-primary-500" />
                {venue}
            </span>
            <span class="flex items-center gap-2">
                <Users class="h-4 w-4 text-primary-700 dark:text-primary-500" />
                {registered} / {capacity} registered
            </span>
        </div>
    </div>
</section>
