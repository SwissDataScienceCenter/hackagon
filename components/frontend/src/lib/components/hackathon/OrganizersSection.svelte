<script lang="ts">
    let {
        description,
        organizers,
    }: {
        description: string;
        organizers: { name: string; logoUrl?: string }[];
    } = $props();
</script>

<section class="flex items-center gap-12 border-t border-surface-200 bg-surface-100 px-20 py-10 dark:border-surface-800 dark:bg-surface-900">
    <div class="flex flex-1 flex-col gap-3">
        <span class="text-xs font-bold tracking-widest text-surface-800 dark:text-surface-100">ORGANIZED BY</span>
        <p class="max-w-[720px] text-sm leading-relaxed text-surface-700 dark:text-surface-100">{description}</p>
    </div>
    <div class="flex shrink-0 items-center gap-6">
        {#each organizers as org, i (i)}
            <div class="flex flex-col items-center gap-1.5">
                <div class="flex h-14 w-14 items-center justify-center preset-outlined-surface-200-800 overflow-hidden">
                    {#if org.logoUrl}
                        <img src={org.logoUrl} alt={org.name} class="h-8 w-8 object-contain dark:invert" />
                    {/if}
                </div>
                <span class="text-xs text-surface-700 dark:text-surface-100">{org.name}</span>
            </div>
        {/each}
    </div>
</section>
