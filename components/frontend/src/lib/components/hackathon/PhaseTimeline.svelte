<script lang="ts">
    import { Check } from 'lucide-svelte';

    let {
        phases,
    }: {
        phases: { name: string; status: 'completed' | 'active' | 'upcoming' }[];
    } = $props();
</script>

<div class="flex h-9 w-full">
    {#each phases as phase (phase.name)}
        {#if phase.status === 'completed'}
            <div class="flex flex-1 items-center justify-center gap-1.5 bg-primary-700 dark:bg-primary-800">
                <Check class="h-3 w-3 text-white/80" />
                <span class="text-xs font-semibold text-white/80">{phase.name}</span>
            </div>
        {:else if phase.status === 'active'}
            <div class="flex flex-1 items-center justify-center gap-1.5 bg-primary-500">
                <span class="h-2 w-2 rounded-full bg-white"></span>
                <span class="text-xs font-bold text-white">{phase.name}</span>
            </div>
        {:else}
            <div class="flex flex-1 items-center justify-center bg-surface-100 dark:bg-surface-800">
                <span class="text-xs text-surface-500">{phase.name}</span>
            </div>
        {/if}
    {/each}
</div>
