<script lang="ts">
    let {
        description,
        organizers,
    }: {
        description: string;
        organizers: { name: string; logoUrl: string; logoDarkUrl?: string }[];
    } = $props();
</script>

<section class="flex flex-col gap-6 bg-raised px-4 py-12 sm:px-10 md:px-20">
    <div class="flex flex-col gap-3">
        <span class="text-xs font-bold tracking-widest text-ink-2">ORGANIZED BY</span>
        <p class="max-w-3xl text-sm leading-relaxed text-ink-2">{description}</p>
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
