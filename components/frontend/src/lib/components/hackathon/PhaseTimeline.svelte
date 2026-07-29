<script lang="ts">
    import { Check } from 'lucide-svelte';

    let {
        phases,
        selectedId,
        onSelect,
    }: {
        phases: { id?: string; name: string; status: 'completed' | 'active' | 'upcoming' }[];
        selectedId?: string;
        onSelect?: (id: string) => void;
    } = $props();

    function isSelected(id: string | undefined): boolean {
        return id !== undefined && id === selectedId;
    }

    function handleClick(id: string | undefined) {
        if (onSelect && id) onSelect(id);
    }
</script>

<div
    class="w-full max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain
           [scrollbar-width:thin] sm:overflow-visible"
>
    <div class="flex h-9 w-max min-w-full sm:w-full">
        {#each phases as phase (phase.id ?? phase.name)}
            {#if phase.status === 'completed'}
                <button
                    type="button"
                    onclick={() => handleClick(phase.id)}
                    class="flex w-[5.5rem] shrink-0 items-center justify-center gap-1 bg-primary-700
                           px-0.5 sm:w-auto sm:min-w-0 sm:flex-1 dark:bg-primary-800
                           {onSelect && phase.id ? 'cursor-pointer' : 'cursor-default'}
                           {isSelected(phase.id) ? 'ring-2 ring-inset ring-white/70' : ''}"
                >
                    <Check class="h-3 w-3 shrink-0 text-white/80" />
                    <span class="truncate text-[0.65rem] font-semibold text-white/80 sm:text-xs">{phase.name}</span>
                </button>
            {:else if phase.status === 'active'}
                <button
                    type="button"
                    onclick={() => handleClick(phase.id)}
                    class="flex w-[5.5rem] shrink-0 items-center justify-center gap-1 bg-primary-500 px-0.5
                           sm:w-auto sm:min-w-0 sm:flex-1
                           {onSelect && phase.id ? 'cursor-pointer' : 'cursor-default'}
                           {isSelected(phase.id) ? 'ring-2 ring-inset ring-white/70' : ''}"
                >
                    <span class="h-2 w-2 shrink-0 rounded-full bg-white"></span>
                    <span class="truncate text-[0.65rem] font-bold text-white sm:text-xs">{phase.name}</span>
                </button>
            {:else}
                <button
                    type="button"
                    onclick={() => handleClick(phase.id)}
                    class="flex w-[5.5rem] shrink-0 items-center justify-center bg-surface-100-900 px-0.5
                           sm:w-auto sm:min-w-0 sm:flex-1
                           {onSelect && phase.id ? 'cursor-pointer' : 'cursor-default'}
                           {isSelected(phase.id) ? 'ring-2 ring-inset ring-primary-500' : ''}"
                >
                    <span class="truncate text-[0.65rem] text-surface-500 sm:text-xs">{phase.name}</span>
                </button>
            {/if}
        {/each}
    </div>
</div>
