<script lang="ts">
    let {
        description,
        organizers,
    }: {
        description: string;
        organizers: { name: string; logoUrl: string; logoDarkUrl?: string }[];
    } = $props();
</script>

<section class="flex flex-col gap-6 bg-surface-100 px-20 py-10 dark:bg-surface-900">
    <div class="flex flex-col gap-3">
        <span class="text-xs font-bold tracking-widest text-surface-800 dark:text-surface-100">ORGANIZED BY</span>
        <p class="max-w-[720px] text-sm leading-relaxed text-surface-700 dark:text-surface-100">{description}</p>
    </div>
    <div class="flex items-center gap-8">
        {#each organizers as org, i (i)}
            <div class="flex h-5 w-24 items-center">
                {#if org.logoDarkUrl}
                    <img src={org.logoUrl} alt={org.name} class="block max-h-full max-w-full object-contain dark:hidden" />
                    <img src={org.logoDarkUrl} alt={org.name} class="hidden max-h-full max-w-full object-contain dark:block" />
                {:else}
                    <img src={org.logoUrl} alt={org.name} class="max-h-full max-w-full object-contain invert dark:invert-0" />
                {/if}
            </div>
        {/each}
    </div>
</section>
