<script lang="ts">
    import { Check } from 'lucide-svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    function formatRange(startsAt: Date | undefined, endsAt: Date | undefined): string {
        const fmt = (d: Date) =>
            d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        if (!startsAt && !endsAt) return 'No dates set';
        if (!startsAt) return `Until ${fmt(endsAt!)}`;
        if (!endsAt) return `From ${fmt(startsAt)}`;
        return `${fmt(startsAt)} – ${fmt(endsAt)}`;
    }

    const STATUS_LABEL = {
        completed: 'Completed',
        active: 'In progress',
        upcoming: 'Upcoming',
    } as const;

    const STATUS_PRESET = {
        completed: 'preset-outlined-surface-200-800',
        active: 'preset-filled-primary-500',
        upcoming: 'preset-tonal-surface',
    } as const;
</script>

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/projects). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-1">
        <h2 class="m-0 text-lg font-bold text-surface-950-50">Timeline</h2>
        <span class="text-xs text-surface-500">
            {data.phases.length === 1 ? '1 phase' : `${data.phases.length} phases`}
        </span>
    </div>

    {#if data.phases.length === 0}
        <p class="m-0 py-6 text-center text-sm text-surface-500">
            No phases have been defined for this hackathon yet.
        </p>
    {:else}
        <ol class="m-0 flex list-none flex-col gap-2 p-0">
            {#each data.phases as phase (phase.id)}
                <li
                    class="box-border w-full border border-surface-200-800 bg-surface-100-900
                           px-5 py-4"
                >
                    <div class="flex flex-col gap-1.5">
                        <div class="flex flex-wrap items-center gap-2">
                            <h3 class="m-0 text-sm font-bold leading-snug text-surface-950-50">
                                {phase.name}
                            </h3>
                            <span class="badge {STATUS_PRESET[phase.status]} text-xs">
                                {#if phase.status === 'completed'}
                                    <Check class="h-3 w-3 shrink-0" aria-hidden="true" />
                                {/if}
                                {STATUS_LABEL[phase.status]}
                            </span>
                        </div>
                        <span class="text-xs text-primary-700-300">
                            {formatRange(phase.startsAt, phase.endsAt)}
                        </span>
                        {#if phase.description}
                            <p class="m-0 text-xs leading-snug text-surface-600-400">
                                {phase.description}
                            </p>
                        {/if}
                    </div>
                </li>
            {/each}
        </ol>
    {/if}
</div>
