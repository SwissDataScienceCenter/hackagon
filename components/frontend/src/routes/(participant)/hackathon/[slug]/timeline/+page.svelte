<script lang="ts">
    import PhaseTimeline from '$lib/components/hackathon/PhaseTimeline.svelte';
    import { phaseStateLabel, phaseStateBadgePreset } from '$lib/utils/phase';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    const phases = $derived(data.phases);

    let selectedId: string | undefined = $state(undefined);

    const defaultId = $derived(phases.find((p) => p.status === 'active')?.id ?? phases[0]?.id);
    const effectiveId = $derived(selectedId ?? defaultId);
    const selectedPhase = $derived(phases.find((p) => p.id === effectiveId));

    function formatRange(startsAt: Date | undefined, endsAt: Date | undefined): string {
        if (!startsAt) return 'No dates set';
        const fmt = (d: Date) =>
            d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        if (!endsAt) return fmt(startsAt);
        if (startsAt.getFullYear() === endsAt.getFullYear() && startsAt.getMonth() === endsAt.getMonth()) {
            const month = startsAt.toLocaleDateString('en-US', { month: 'short' });
            return `${month} ${startsAt.getDate()} – ${endsAt.getDate()}, ${startsAt.getFullYear()}`;
        }
        return `${fmt(startsAt)} – ${fmt(endsAt)}`;
    }
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <h2 class="m-0 text-lg font-bold text-surface-950-50">Timeline</h2>
        <span class="text-xs text-surface-500">{phases.length} phases</span>
    </div>

    {#if phases.length === 0}
        <p class="m-0 text-sm text-surface-500">No phases have been set for this hackathon yet.</p>
    {:else}
        <PhaseTimeline
            phases={phases.map((p) => ({ id: p.id, name: p.name, status: p.status }))}
            selectedId={effectiveId}
            onSelect={(id) => (selectedId = id)}
        />

        {#if selectedPhase}
            <div class="card preset-outlined-surface-200-800 flex flex-col gap-2 p-4">
                <div class="flex flex-wrap items-center gap-2">
                    <span class="badge {phaseStateBadgePreset(selectedPhase.status)}">
                        {phaseStateLabel(selectedPhase.status)}
                    </span>
                    <h3 class="m-0 text-sm font-bold text-surface-950-50">{selectedPhase.name}</h3>
                    <span class="text-xs text-surface-500">
                        {formatRange(selectedPhase.startsAt, selectedPhase.endsAt)}
                    </span>
                </div>
                {#if selectedPhase.description}
                    <p class="m-0 text-xs leading-relaxed text-surface-600-400">{selectedPhase.description}</p>
                {:else}
                    <p class="m-0 text-xs text-surface-500">No description provided.</p>
                {/if}
            </div>
        {/if}
    {/if}
</div>
