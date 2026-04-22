<script lang="ts">
    import { Presentation, Wrench, ExternalLink, Video } from 'lucide-svelte';
    import type { Component } from 'svelte';

    let {
        events,
    }: {
        events: { title: string; speaker: string; date: string; linkUrl?: string; icon?: string }[];
    } = $props();

    const icons: Record<string, Component> = {
        presentation: Presentation,
        wrench: Wrench,
    };
</script>

<section class="bg-surface-100 px-20 py-12 dark:bg-surface-900">
    <div class="mb-6 flex items-center gap-2">
        <Video class="h-5 w-5 text-primary-700 dark:text-primary-500" />
        <h2 class="text-xl font-bold">Pre-event Webinars</h2>
    </div>

    <div class="grid grid-cols-2 gap-5">
        {#each events as event, i (i)}
            <div class="card preset-filled-surface-50-950 flex items-start gap-4 border border-surface-200 p-5 dark:border-surface-800">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center preset-tonal-primary">
                    <svelte:component this={icons[event.icon ?? 'presentation'] ?? Presentation} class="h-5 w-5" />
                </div>
                <div class="flex flex-col gap-1.5">
                    <span class="text-sm font-semibold">{event.title}</span>
                    <span class="text-xs text-surface-700 dark:text-surface-100">{event.speaker}</span>
                    <span class="text-xs text-surface-700 dark:text-surface-100">{event.date}</span>
                    {#if event.linkUrl}
                        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
                        <a href={event.linkUrl} class="flex items-center gap-1 text-xs text-primary-700 dark:text-primary-500 no-underline hover:underline">
                            More info
                            <ExternalLink class="h-3 w-3" />
                        </a>
                    {/if}
                </div>
            </div>
        {/each}
    </div>
</section>
