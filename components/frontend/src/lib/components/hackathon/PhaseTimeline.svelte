<script lang="ts">
    import { Check } from 'lucide-svelte';

    let {
        phases,
    }: {
        phases: { name: string; status: 'completed' | 'active' | 'upcoming' }[];
    } = $props();
</script>

<div
    class="w-full max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain
           [scrollbar-width:thin] sm:overflow-visible"
>
    <div class="flex h-9 w-max min-w-full sm:w-full">
        {#each phases as phase (phase.name)}
            {#if phase.status === 'completed'}
                <div
                    class="flex w-[5.5rem] shrink-0 items-center justify-center gap-1 bg-primary-700
                           px-0.5 sm:w-auto sm:min-w-0 sm:flex-1 dark:bg-primary-800"
                >
                    <Check class="h-3 w-3 shrink-0 text-white/80" />
                    <span class="truncate text-[0.65rem] font-semibold text-white/80 sm:text-xs">{phase.name}</span>
                </div>
            {:else if phase.status === 'active'}
                <div
                    class="flex w-[5.5rem] shrink-0 items-center justify-center gap-1 bg-primary-500 px-0.5
                           sm:w-auto sm:min-w-0 sm:flex-1"
                >
                    <span class="h-2 w-2 shrink-0 rounded-full bg-white"></span>
                    <span class="truncate text-[0.65rem] font-bold text-white sm:text-xs">{phase.name}</span>
                </div>
            {:else}
                <div
                    class="flex w-[5.5rem] shrink-0 items-center justify-center bg-surface-100-900 px-0.5
                           sm:w-auto sm:min-w-0 sm:flex-1"
                >
                    <span class="truncate text-[0.65rem] text-surface-500 sm:text-xs">{phase.name}</span>
                </div>
            {/if}
        {/each}
    </div>
</div>
