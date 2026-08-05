<script lang="ts">
    import { Check, FileText, Pencil, Plus } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import RightNowPanel from '$lib/components/hackathon/RightNowPanel.svelte';
    import { capabilityLabel } from '$lib/utils/phase';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    function formatRange(startsAt: Date | undefined, endsAt: Date | undefined): string {
        const fmt = (d: Date) =>
            d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        if (!startsAt && !endsAt) return 'No dates set';
        if (!startsAt) return `Until ${fmt(endsAt!)}`;
        if (!endsAt) return `From ${fmt(startsAt)}`;
        return `${fmt(startsAt)} – ${fmt(endsAt)}`;
    }

    // 'current' is the organizer's declaration, 'active' is derived from dates.
    // They never appear on the same timeline: once a phase is declared current,
    // resolvePhaseStatus stops calling any phase 'active'.
    const STATUS_LABEL = {
        completed: 'Completed',
        active: 'In progress',
        upcoming: 'Upcoming',
        current: 'Current phase',
    } as const;

    const STATUS_PRESET = {
        completed: 'preset-outlined-surface-200-800',
        active: 'preset-filled-primary-500',
        upcoming: 'preset-tonal-surface',
        current: 'preset-filled-primary-500',
    } as const;

    const currentPhase = $derived(data.phases.find((p) => p.id === data.currentPhaseId));
</script>

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/projects). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-1">
            <h2 class="m-0 text-lg font-bold text-surface-950-50">Timeline</h2>
            <span class="text-xs text-surface-500">
                {data.phases.length === 1 ? '1 phase' : `${data.phases.length} phases`}
            </span>
        </div>
        {#if data.mayManage}
            <a
                href={resolve(`/my/hackathon/${data.hackathonId}/timeline/new`)}
                class="btn btn-sm preset-filled-primary-500 no-underline"
            >
                <Plus class="h-3 w-3 shrink-0" aria-hidden="true" />
                Add phase
            </a>
        {/if}
    </div>

    <!-- Organizer-only, and first on the page: it is the only part that answers
         what is true this minute, and every organizer action starts here. The
         loader sends a participant none of the data it needs. -->
    {#if data.mayManage}
        <RightNowPanel
            currentPhaseName={data.currentPhaseName}
            currentPhaseRange={currentPhase
                ? formatRange(currentPhase.startsAt, currentPhase.endsAt)
                : ''}
            hasCurrentPhase={data.currentPhaseId !== ''}
            hasState={data.hasState}
            capabilities={data.capabilities}
            unmet={data.unmet}
            message={form?.message}
            saved={form?.saved ?? false}
        />
    {/if}

    {#if data.phases.length === 0}
        <p class="m-0 py-6 text-center text-sm text-surface-500">
            {#if data.mayManage}
                No phases yet. Add one to give participants a timeline to follow.
            {:else}
                No phases have been defined for this hackathon yet.
            {/if}
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
                            {#if data.mayManage}
                                <a
                                    href={resolve(
                                        `/my/hackathon/${data.hackathonId}/timeline/${phase.id}/edit`
                                    )}
                                    class="ml-auto text-xs font-semibold text-primary-700-300
                                           no-underline hover:underline"
                                >
                                    <Pencil class="inline h-3 w-3 shrink-0" aria-hidden="true" />
                                    Edit<span class="sr-only"> {phase.name}</span>
                                </a>
                            {/if}
                        </div>
                        <span class="text-xs text-primary-700-300">
                            {formatRange(phase.startsAt, phase.endsAt)}
                        </span>
                        {#if phase.description}
                            <p class="m-0 text-xs leading-snug text-surface-600-400">
                                {phase.description}
                            </p>
                        {/if}

                        <!-- What the phase is *for* — a plan, not permissions. Dimmed
                             on purpose: it is reference information, and the switches
                             in Right now are the ones that decide anything. The
                             current phase carries the same tags undimmed, since that
                             is the row the warning above refers to. -->
                        {#if phase.capabilities.length > 0}
                            <div
                                class="flex flex-wrap items-baseline gap-1 pt-0.5
                                       {phase.status === 'current' ? '' : 'opacity-60'}"
                            >
                                <span class="text-[0.625rem] text-surface-500">
                                    For this phase:
                                </span>
                                {#each phase.capabilities as capability (capability)}
                                    <span class="badge preset-tonal-surface text-[0.625rem]">
                                        {capabilityLabel(capability) ?? 'Unknown'}
                                    </span>
                                {/each}
                            </div>
                        {/if}

                        {#if phase.pageId || (data.mayManage && phase.status !== 'current')}
                            <div class="flex flex-wrap items-center gap-3 pt-1">
                                {#if phase.pageId}
                                    <a
                                        href={resolve(
                                            `/my/hackathon/${data.hackathonId}/pages/${phase.pageId}`
                                        )}
                                        class="inline-flex items-center gap-1 text-xs font-semibold
                                               text-primary-700-300 no-underline hover:underline"
                                    >
                                        <FileText class="h-3 w-3 shrink-0" aria-hidden="true" />
                                        Read more
                                    </a>
                                {/if}
                                <!-- Declaring a phase current is a write, so a form
                                     rather than a link. It moves the pointer only;
                                     what participants may do is unchanged. -->
                                {#if data.mayManage && phase.status !== 'current'}
                                    <form method="POST" action="?/setCurrent">
                                        <input type="hidden" name="phaseId" value={phase.id} />
                                        <button
                                            type="submit"
                                            class="btn btn-sm preset-tonal-surface text-xs"
                                        >
                                            Make current<span class="sr-only"> — {phase.name}</span>
                                        </button>
                                    </form>
                                {/if}
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ol>
    {/if}
</div>
