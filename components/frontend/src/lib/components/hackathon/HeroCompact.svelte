<script lang="ts">
    let {
        title,
        dates,
        venue,
        imageUrl,
        participantCount,
        participantCapacity,
        organizers,
    }: {
        title: string;
        dates: string;
        venue: string;
        imageUrl?: string;
        participantCount: number;
        participantCapacity: number;
        organizers: { name: string; logoUrl: string; logoDarkUrl?: string }[];
    } = $props();
</script>

<section class="flex h-44 items-center gap-8 bg-surface-100 px-20 dark:bg-surface-900">
    {#if imageUrl}
        <div class="h-36 w-56 shrink-0 overflow-hidden border border-surface-200 dark:border-surface-800">
            <img src={imageUrl} alt={title} class="h-full w-full object-cover" />
        </div>
    {/if}

    <div class="flex flex-1 flex-col gap-1.5">
        <span class="text-xs font-semibold text-primary-700 dark:text-primary-500">{dates}</span>
        <h1 class="text-xl font-bold">{title}</h1>
        <span class="text-xs text-primary-700 dark:text-primary-500">{venue}</span>
        <div class="mt-1 flex items-center gap-4">
            {#each organizers as org (org.name)}
                <div class="flex h-4 w-16 items-center">
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

    <div class="flex flex-col items-center gap-1 text-surface-700 dark:text-surface-100">
        <span class="text-2xl font-bold">{participantCount}</span>
        <span class="text-xs">/ {participantCapacity}</span>
        <span class="text-xs text-surface-500">participants</span>
    </div>
</section>
