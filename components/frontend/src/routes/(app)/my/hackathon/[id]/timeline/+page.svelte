<script lang="ts">
    import { Check, FileText, Pencil, Plus, TriangleAlert } from 'lucide-svelte';
    import { resolve } from '$app/paths';
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

    {#if form?.message}
        <p class="m-0 text-xs text-error-500" role="alert">{form.message}</p>
    {/if}

    <!-- The cost of phases being descriptive, made visible: the phase says these
         should be happening and they are switched off. Only an organizer sees it,
         because only an organizer can act on it. -->
    {#if data.unmet.length > 0}
        <div
            class="flex flex-col gap-2 border border-warning-500/40 bg-warning-500/10 px-4 py-3"
            role="status"
        >
            <div class="flex items-center gap-2">
                <TriangleAlert class="h-4 w-4 shrink-0 text-warning-700-300" aria-hidden="true" />
                <span class="text-xs font-bold text-surface-950-50">
                    {data.currentPhaseName} expects things that are switched off
                </span>
            </div>
            <p class="m-0 text-xs text-surface-600-400">
                Moving to a phase does not enable anything on its own. Participants
                cannot yet
                {#each data.unmet as capability, i (capability)}{i > 0
                        ? i === data.unmet.length - 1
                            ? ' or '
                            : ', '
                        : ''}<strong class="font-semibold text-surface-950-50"
                        >{(capabilityLabel(capability) ?? 'Unknown').toLowerCase()}</strong
                    >{/each}.
            </p>
            <a
                href={resolve(`/my/hackathon/${data.hackathonId}/settings`)}
                class="btn btn-sm w-fit preset-tonal-warning no-underline"
            >
                Review capabilities
            </a>
        </div>
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
                        <!-- Informational tags, not permissions: what participants
                             may actually do is set separately on the hackathon. -->
                        {#if phase.capabilities.length > 0}
                            <div class="flex flex-wrap gap-1 pt-0.5">
                                {#each phase.capabilities as capability (capability)}
                                    <span class="badge preset-tonal-surface text-[0.625rem]">
                                        {capabilityLabel(capability) ?? 'Unknown'}
                                    </span>
                                {/each}
                            </div>
                        {/if}

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
                                 rather than a link. The backend stays the authority;
                                 mayManage only decides whether to offer it. -->
                            {#if data.mayManage && phase.status !== 'current'}
                                <form method="POST" action="?/setCurrent">
                                    <input type="hidden" name="phaseId" value={phase.id} />
                                    <button
                                        type="submit"
                                        class="btn btn-sm preset-tonal-surface text-xs"
                                    >
                                        Make current
                                    </button>
                                </form>
                            {/if}
                        </div>
                    </div>
                </li>
            {/each}
        </ol>

        <!-- Omitting phaseId entirely is what clears the declaration: the action
             sends "" and SetCurrentPhase reads that as ClearCurrentPhase. -->
        {#if data.mayManage && data.currentPhaseId}
            <form method="POST" action="?/setCurrent" class="flex flex-col gap-1">
                <button type="submit" class="btn btn-sm w-fit preset-tonal-surface text-xs">
                    Clear current phase
                </button>
                <span class="text-xs text-surface-500">
                    The timeline goes back to deriving progress from the dates alone.
                </span>
            </form>
        {/if}
    {/if}
</div>
