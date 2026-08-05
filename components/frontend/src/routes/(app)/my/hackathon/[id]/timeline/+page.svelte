<script lang="ts">
    import { Check, FileText, Pencil, Plus, X } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import CapabilitiesPanel from '$lib/components/hackathon/CapabilitiesPanel.svelte';
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

    const STATUS_VARIANT = {
        completed: 'badge-neutral',
        active: 'badge-solid',
        upcoming: 'badge-neutral',
        current: 'badge-solid',
    } as const;
</script>

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/projects). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <h2 class="m-0 text-lg font-bold text-ink">Timeline</h2>

    <!-- Organizer-only, and above the phases: what participants may do is
         hackathon-wide, so it is not one of the phases and does not sit among
         them. The loader sends a participant none of the data it needs. -->
    {#if data.mayManage}
        <CapabilitiesPanel
            currentPhaseName={data.currentPhaseName}
            hasState={data.hasState}
            capabilities={data.capabilities}
            unmet={data.unmet}
            message={form?.message}
            saved={form?.saved ?? false}
        />
    {/if}

    <!-- Every phase action lives in this section — add, make current, clear, edit
         — so there is one place to act on a phase and one place to act on the
         hackathon. The heading is what keeps the list labelled now that something
         else sits above it. -->
    <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-0.5">
            <h3 class="m-0 text-sm font-bold text-ink">Phases</h3>
            <span class="text-xs text-ink-3">
                {data.phases.length === 1 ? '1 phase' : `${data.phases.length} phases`}
            </span>
        </div>
        {#if data.mayManage}
            <a
                href={resolve(`/my/hackathon/${data.hackathonId}/timeline/new`)}
                class="btn btn-sm btn-solid no-underline"
            >
                <Plus class="h-3 w-3 shrink-0" aria-hidden="true" />
                Add phase
            </a>
        {/if}
    </div>

    {#if data.phases.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
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
                    class="box-border w-full border border-line bg-raised
                           px-5 py-4"
                >
                    <div class="flex flex-col gap-1.5">
                        <div class="flex flex-wrap items-center gap-2">
                            <h3 class="m-0 text-sm font-bold leading-snug text-ink">
                                {phase.name}
                            </h3>
                            <span class="badge {STATUS_VARIANT[phase.status]} text-xs">
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
                                    class="ml-auto text-xs font-semibold text-accent-ink
                                           no-underline hover:underline"
                                >
                                    <Pencil class="inline h-3 w-3 shrink-0" aria-hidden="true" />
                                    Edit<span class="sr-only"> {phase.name}</span>
                                </a>
                            {/if}
                        </div>
                        <span class="text-xs text-accent-ink">
                            {formatRange(phase.startsAt, phase.endsAt)}
                        </span>
                        {#if phase.description}
                            <p class="m-0 text-xs leading-snug text-ink-2">
                                {phase.description}
                            </p>
                        {/if}

                        <!-- What the phase is *planned* for — not permissions. Dimmed
                             on every phase but the current one, because it is
                             reference information; the switches above are what decide
                             anything.

                             On the current phase only, each plan is ticked off
                             against what is actually switched on: green for live,
                             warning for not yet. Doing that on a future phase would
                             flag "vote not enabled" as a problem when it is simply
                             not time yet. -->
                        {#if phase.capabilities.length > 0}
                            <div
                                class="flex flex-wrap items-baseline gap-1 pt-0.5
                                       {phase.status === 'current' ? '' : 'opacity-60'}"
                            >
                                <span class="text-[0.625rem] text-ink-3">
                                    Planned for this phase:
                                </span>
                                {#each phase.capabilities as capability (capability)}
                                    {@const live =
                                        phase.status === 'current' &&
                                        data.enabled.includes(capability)}
                                    {@const pending =
                                        phase.status === 'current' &&
                                        !data.enabled.includes(capability)}
                                    <!-- Icon as well as colour: colour alone is not a
                                         signal for anyone who cannot distinguish it. -->
                                    <span
                                        class="badge text-[0.625rem] {live
                                            ? 'badge-success'
                                            : pending
                                              ? 'badge-warning'
                                              : 'badge-neutral'}"
                                    >
                                        {#if live}
                                            <Check class="h-3 w-3 shrink-0" aria-hidden="true" />
                                        {:else if pending}
                                            <X class="h-3 w-3 shrink-0" aria-hidden="true" />
                                        {/if}
                                        {capabilityLabel(capability) ?? 'Unknown'}
                                        {#if live}
                                            <span class="sr-only"> — enabled</span>
                                        {:else if pending}
                                            <span class="sr-only"> — not enabled yet</span>
                                        {/if}
                                    </span>
                                {/each}
                            </div>
                        {/if}

                        <!-- Switched on beyond this phase's plan. Only meaningful for
                             the current phase, and never a warning: registration is
                             planned for no phase yet legitimately spans several. -->
                        {#if phase.status === 'current' && data.alsoEnabled.length > 0}
                            <div class="flex flex-wrap items-baseline gap-1">
                                <span class="text-[0.625rem] text-ink-3">
                                    Also enabled:
                                </span>
                                {#each data.alsoEnabled as capability (capability)}
                                    <span class="badge badge-success text-[0.625rem]">
                                        <Check class="h-3 w-3 shrink-0" aria-hidden="true" />
                                        {capabilityLabel(capability) ?? 'Unknown'}
                                    </span>
                                {/each}
                            </div>
                        {/if}

                        {#if phase.pageId || data.mayManage}
                            <div class="flex flex-wrap items-center gap-3 pt-1">
                                {#if phase.pageId}
                                    <a
                                        href={resolve(
                                            `/my/hackathon/${data.hackathonId}/pages/${phase.pageId}`
                                        )}
                                        class="inline-flex items-center gap-1 text-xs font-semibold
                                               text-accent-ink no-underline hover:underline"
                                    >
                                        <FileText class="h-3 w-3 shrink-0" aria-hidden="true" />
                                        Read more
                                    </a>
                                {/if}
                                <!-- Both are writes, so forms rather than links, and
                                     both move the pointer only — what participants
                                     may do is unchanged either way. Clearing sends no
                                     phaseId, which the action reads as "clear". -->
                                {#if data.mayManage}
                                    {#if phase.status === 'current'}
                                        <form method="POST" action="?/setCurrent">
                                            <button
                                                type="submit"
                                                class="btn btn-sm btn-ghost text-xs"
                                            >
                                                Clear current phase
                                            </button>
                                        </form>
                                    {:else}
                                        <form method="POST" action="?/setCurrent">
                                            <input type="hidden" name="phaseId" value={phase.id} />
                                            <button
                                                type="submit"
                                                class="btn btn-sm btn-ghost text-xs"
                                            >
                                                Make current<span class="sr-only">
                                                    — {phase.name}</span
                                                >
                                            </button>
                                        </form>
                                    {/if}
                                {/if}
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ol>
    {/if}
</div>
