<script lang="ts">
    import { Check } from 'lucide-svelte';
    import type { PhaseState } from '$lib/utils/phase';

    interface Segment {
        id?: string;
        name: string;
        status: PhaseState;
    }

    let {
        phases,
        selectedId,
        hrefFor,
    }: {
        phases: Segment[];
        selectedId?: string;
        /** Omit for a read-only bar; supply it to make each segment a link.
         *  Selection is a navigation now, so these are anchors, not buttons. */
        hrefFor?: (id: string) => string;
    } = $props();

    const BASE =
        'flex w-[5.5rem] shrink-0 items-center justify-center gap-1 px-0.5 no-underline ' +
        'sm:w-auto sm:min-w-0 sm:flex-1';

    const TONE: Record<PhaseState, string> = {
        completed: 'bg-primary-700 dark:bg-primary-800',
        active: 'bg-primary-500',
        upcoming: 'bg-surface-100-900',
    };

    // Upcoming segments are pale, so a white ring would be invisible on them.
    const RING: Record<PhaseState, string> = {
        completed: 'ring-2 ring-inset ring-white/70',
        active: 'ring-2 ring-inset ring-white/70',
        upcoming: 'ring-2 ring-inset ring-primary-500',
    };

    const LABEL: Record<PhaseState, string> = {
        completed: 'truncate text-[0.65rem] font-semibold text-white/80 sm:text-xs',
        active: 'truncate text-[0.65rem] font-bold text-white sm:text-xs',
        upcoming: 'truncate text-[0.65rem] text-surface-500 sm:text-xs',
    };

    function isSelected(segment: Segment): boolean {
        return segment.id !== undefined && segment.id === selectedId;
    }

    function classesFor(segment: Segment): string {
        return `${BASE} ${TONE[segment.status]} ${isSelected(segment) ? RING[segment.status] : ''}`;
    }

    function linkFor(segment: Segment): string | undefined {
        return hrefFor && segment.id ? hrefFor(segment.id) : undefined;
    }
</script>

{#snippet body(segment: Segment)}
    {#if segment.status === 'completed'}
        <Check class="h-3 w-3 shrink-0 text-white/80" />
    {:else if segment.status === 'active'}
        <span class="h-2 w-2 shrink-0 rounded-full bg-white"></span>
    {/if}
    <span class={LABEL[segment.status]}>{segment.name}</span>
{/snippet}

<div
    class="w-full max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain
           [scrollbar-width:thin] sm:overflow-visible"
>
    <div class="flex h-9 w-max min-w-full sm:w-full">
        {#each phases as phase (phase.id ?? phase.name)}
            {@const href = linkFor(phase)}
            {#if href}
                <a
                    {href}
                    class={classesFor(phase)}
                    aria-current={isSelected(phase) ? 'page' : undefined}
                >
                    {@render body(phase)}
                </a>
            {:else}
                <div class={classesFor(phase)}>
                    {@render body(phase)}
                </div>
            {/if}
        {/each}
    </div>
</div>
