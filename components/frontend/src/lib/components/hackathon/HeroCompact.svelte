<script lang="ts">
    let {
        title,
        dates,
        venue,
        imageUrl,
        participantCount,
        participantCapacity,
        organizers,
        badges = [],
    }: {
        title: string;
        dates: string;
        venue: string;
        imageUrl?: string;
        participantCount: number;
        /**
         * TODO(backend: hackathon-venue-capacity): omitted by every caller —
         * Hackathon has no capacity field, so there is nothing to pass. Until
         * one exists the count renders on its own, without a "/ N" denominator.
         */
        participantCapacity?: number;
        organizers: { name: string; logoUrl: string; logoDarkUrl?: string }[];
        badges?: { label: string; variant: string }[];
    } = $props();
</script>

<section
    class="flex flex-col gap-4 bg-raised px-4 py-4 sm:px-10 sm:py-6 md:flex-row md:items-center
           md:gap-8 md:px-20 md:py-0 min-h-0 md:h-44"
>
    {#if imageUrl}
        <div
            class="aspect-[4/3] w-full max-w-md shrink-0 overflow-hidden border
                   border-line sm:aspect-auto sm:max-w-none sm:h-36 sm:w-56"
        >
            <img src={imageUrl} alt={title} class="h-full w-full object-cover" />
        </div>
    {/if}

    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <span class="text-xs font-semibold text-accent-ink">{dates}</span>
        <h1 class="text-lg font-bold sm:text-xl">{title}</h1>
        {#if badges.length > 0}
            <div class="flex flex-wrap gap-1.5">
                {#each badges as b (b.label)}
                    <span class="badge {b.variant} text-xs">{b.label}</span>
                {/each}
            </div>
        {/if}
        <span class="text-xs text-accent-ink">{venue}</span>
        <div class="mt-1 flex flex-wrap items-center gap-3 sm:gap-4">
            {#each organizers as org (org.name)}
                <div class="flex h-4 min-w-0 max-w-24 items-center sm:w-16">
                    {#if org.logoDarkUrl}
                        <img src={org.logoUrl} alt={org.name} class="block max-h-full max-w-full object-contain dark:hidden" />
                        <img src={org.logoDarkUrl} alt={org.name} class="hidden max-h-full max-w-full object-contain dark:block" />
                    {:else}
                        <img src={org.logoUrl} alt={org.name} class="max-h-full max-w-full object-contain invert dark:invert-0" />
                    {/if}
                </div>
            {/each}
        </div>
    </div>

    <div
        class="flex flex-row items-center justify-between gap-2 border-t border-line pt-3
               sm:flex-col sm:justify-center sm:gap-1 sm:border-0 sm:pt-0 md:shrink-0
               text-ink-2"
    >
        <div class="flex items-baseline gap-1.5 sm:flex-col sm:items-center sm:gap-0">
            <span class="text-2xl font-bold">{participantCount}</span>
            {#if participantCapacity !== undefined}
                <span class="text-xs">/ {participantCapacity}</span>
            {/if}
        </div>
        <span class="text-xs text-ink-3 sm:text-center">participants</span>
    </div>
</section>
