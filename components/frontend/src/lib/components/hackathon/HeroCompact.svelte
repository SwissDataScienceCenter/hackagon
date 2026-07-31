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
        participantCapacity: number;
        organizers: { name: string; logoUrl: string; logoDarkUrl?: string }[];
        badges?: { label: string; preset: string }[];
    } = $props();
</script>

<section
    class="flex flex-col gap-4 bg-surface-100-900 px-4 py-4 sm:px-10 sm:py-6 md:flex-row md:items-center
           md:gap-8 md:px-20 md:py-0 min-h-0 md:h-44"
>
    {#if imageUrl}
        <div
            class="aspect-[4/3] w-full max-w-md shrink-0 overflow-hidden border
                   border-surface-200-800 sm:aspect-auto sm:max-w-none sm:h-36 sm:w-56"
        >
            <img src={imageUrl} alt={title} class="h-full w-full object-cover" />
        </div>
    {/if}

    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <span class="text-xs font-semibold text-primary-700-300">{dates}</span>
        <h1 class="text-lg font-bold sm:text-xl">{title}</h1>
        {#if badges.length > 0}
            <div class="flex flex-wrap gap-1.5">
                <!-- Keyed by position, not label: badge text can carry
                     user-supplied names (e.g. a team), which are not unique. -->
                {#each badges as b, i (i)}
                    <span class="badge {b.preset} text-xs">{b.label}</span>
                {/each}
            </div>
        {/if}
        <span class="text-xs text-primary-700-300">{venue}</span>
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
        class="flex flex-row items-center justify-between gap-2 border-t border-surface-200-800 pt-3
               sm:flex-col sm:justify-center sm:gap-1 sm:border-0 sm:pt-0 md:shrink-0
               text-surface-700-300"
    >
        <div class="flex items-baseline gap-1.5 sm:flex-col sm:items-center sm:gap-0">
            <span class="text-2xl font-bold">{participantCount}</span>
            <span class="text-xs">/ {participantCapacity}</span>
        </div>
        <span class="text-xs text-surface-500 sm:text-center">participants</span>
    </div>
</section>
