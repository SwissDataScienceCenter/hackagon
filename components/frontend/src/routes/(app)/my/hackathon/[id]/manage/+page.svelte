<script lang="ts">
    import { manageNav } from '$lib/navigation';
    import CurrentStateCard from '$lib/components/hackathon/CurrentStateCard.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    // The same list the sidebar renders, so a destination added there appears
    // here without being named twice — the mistake that leaves one surface
    // quietly missing an entry.
    const items = $derived(
        manageNav(data.hackathon.id, data.myMembership ?? undefined, data.isGlobalAdmin)
    );
</script>

<svelte:head><title>Manage · {data.hackathon.name}</title></svelte:head>

<div class="flex w-full flex-col gap-8 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <h1 class="m-0 text-title text-ink">Manage this hackathon</h1>
        <p class="m-0 text-xs text-ink-3">
            Everything you can change about {data.hackathon.name}, in one place.
        </p>
    </div>

    <!-- The organiser's own view of what participants can do right now. Same
         card they see, deliberately: an organiser checking "is registration
         open" should read the answer participants read, not a separate
         rendering of the same state that can drift from it. -->
    <CurrentStateCard
        hackathonId={data.hackathon.id}
        capabilities={data.hackathon.capabilities ?? []}
        currentPhaseName={data.currentPhaseName ?? ''}
    />

    {#if items.length > 0}
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {#each items as item (item.id)}
                <a
                    href={item.href}
                    class="card flex items-start gap-3 p-4 no-underline transition-colors
                           hover:bg-raised"
                >
                    <item.icon class="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" aria-hidden="true" />
                    <span class="flex min-w-0 flex-col gap-0.5">
                        <span class="text-sm font-semibold text-ink">{item.label}</span>
                        {#if item.description}
                            <span class="text-meta text-ink-3">{item.description}</span>
                        {/if}
                    </span>
                </a>
            {/each}
        </div>
    {/if}
</div>
