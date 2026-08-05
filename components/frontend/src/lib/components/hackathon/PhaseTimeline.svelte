<script lang="ts">
    import { Check } from 'lucide-svelte';

    let {
        phases,
    }: {
        // 'current' is an organizer's declaration, 'active' is derived from dates.
        // The bar draws them identically — it answers "where are we" in one glance
        // and the distinction between how that was decided belongs on the timeline
        // page, not in a 9px-tall strip.
        phases: { name: string; status: 'completed' | 'active' | 'upcoming' | 'current' }[];
    } = $props();
</script>

<div
    class="w-full max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain
           [scrollbar-width:thin] sm:overflow-visible"
>
    <div class="flex h-9 w-max min-w-full sm:w-full">
        {#each phases as phase (phase.name)}
            {#if phase.status === 'completed'}
                <!-- Completed reads as a recessed accent rather than a second
                     solid fill, so the one full-strength segment in the bar is
                     always the phase you are actually in. -->
                <div
                    class="flex w-[5.5rem] shrink-0 items-center justify-center gap-1 bg-accent/25
                           px-0.5 sm:w-auto sm:min-w-0 sm:flex-1"
                >
                    <Check class="h-3 w-3 shrink-0 text-accent-ink" />
                    <span class="truncate text-[0.65rem] font-semibold text-accent-ink sm:text-xs"
                        >{phase.name}</span
                    >
                </div>
            {:else if phase.status === 'active' || phase.status === 'current'}
                <div
                    class="flex w-[5.5rem] shrink-0 items-center justify-center gap-1 bg-accent px-0.5
                           sm:w-auto sm:min-w-0 sm:flex-1"
                >
                    <!-- `text-white` on the lime accent measured ~1.3:1. The
                         accent's paired ink token is the only safe foreground. -->
                    <span class="h-2 w-2 shrink-0 rounded-full bg-on-accent"></span>
                    <span class="truncate text-[0.65rem] font-bold text-on-accent sm:text-xs"
                        >{phase.name}</span
                    >
                </div>
            {:else}
                <div
                    class="flex w-[5.5rem] shrink-0 items-center justify-center bg-raised px-0.5
                           sm:w-auto sm:min-w-0 sm:flex-1"
                >
                    <span class="truncate text-[0.65rem] text-ink-3 sm:text-xs">{phase.name}</span>
                </div>
            {/if}
        {/each}
    </div>
</div>
