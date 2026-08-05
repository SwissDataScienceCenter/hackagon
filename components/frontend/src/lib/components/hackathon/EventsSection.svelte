<script lang="ts">
    import { Presentation, Wrench, ExternalLink, Video } from 'lucide-svelte';

    let {
        events,
    }: {
        events: { title: string; speaker: string; date: string; linkUrl?: string; icon?: string }[];
    } = $props();

    const iconByKey = { presentation: Presentation, wrench: Wrench } as const;

    function iconFor(name?: string) {
        if (name && name in iconByKey) {
            return iconByKey[name as keyof typeof iconByKey];
        }
        return iconByKey.presentation;
    }
</script>

<section class="bg-raised px-4 py-12 sm:px-10 md:px-20">
    <div class="mb-6 flex items-center gap-2">
        <Video class="h-5 w-5 text-accent-ink" />
        <h2 class="text-xl font-bold">Pre-event Webinars</h2>
    </div>

    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {#each events as event, i (i)}
            {@const EventIcon = iconFor(event.icon)}
            <div
                class="card flex items-start gap-4 border
                       border-line p-5"
            >
                <div class="flex h-10 w-10 shrink-0 items-center justify-center bg-accent/20 text-accent-ink">
                    <EventIcon class="h-5 w-5" />
                </div>
                <div class="flex flex-col gap-1.5">
                    <span class="text-sm font-semibold">{event.title}</span>
                    <span class="text-xs text-ink-2">{event.speaker}</span>
                    <span class="text-xs text-ink-2">{event.date}</span>
                    {#if event.linkUrl}
                        <!-- eslint-disable svelte/no-navigation-without-resolve -- external event URL from data -->
                        <a
                            href={event.linkUrl}
                            class="btn btn-sm w-fit inline-flex items-center gap-1 btn-ghost
                                   no-underline"
                        >
                            More info
                            <ExternalLink class="h-3 w-3" />
                        </a>
                        <!-- eslint-enable svelte/no-navigation-without-resolve -->
                    {/if}
                </div>
            </div>
        {/each}
    </div>
</section>
