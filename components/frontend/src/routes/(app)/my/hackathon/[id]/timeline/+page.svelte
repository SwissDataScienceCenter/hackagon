<script lang="ts">
    import { Check, FileText } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import { capabilityLabel, formatPhaseRange } from '$lib/utils/phase';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    // 'current' is the organizer's declaration, 'active' is derived from dates.
    // They never appear on the same timeline: once a phase is declared current,
    // resolvePhaseStatus stops calling any phase 'active'.
    const STATUS_LABEL = {
        completed: 'Completed',
        active: 'In progress',
        upcoming: 'Upcoming',
        current: 'Current phase',
    } as const;

    // Info rather than the accent: these are lifecycle states, and this page has
    // no action for the accent to belong to. Completed and upcoming stay neutral —
    // the tick is what separates them.
    const STATUS_VARIANT = {
        completed: 'badge-neutral',
        active: 'badge-info',
        upcoming: 'badge-neutral',
        current: 'badge-info',
    } as const;
</script>

<!--
  What is happening and when, and nothing to act on: adding, editing and
  declaring a current phase live on the Manage Timeline page (see $lib/navigation's
  manageNav), together with the capability switches. The only link here is a
  phase's own page, which is content a participant reads.

  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/projects).
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-1">
        <h2 class="m-0 text-title text-ink">Timeline</h2>
        <span class="text-xs text-ink-3">
            {data.phases.length === 1 ? '1 phase' : `${data.phases.length} phases`}
        </span>
    </div>

    {#if data.phases.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            No phases have been defined for this hackathon yet.
        </p>
    {:else}
        <ol class="m-0 flex list-none flex-col gap-2 p-0">
            {#each data.phases as phase (phase.id)}
                <li class="card card-raised box-border w-full px-5 py-4">
                    <div class="flex flex-col gap-1.5">
                        <div class="flex flex-wrap items-center gap-2">
                            <h3 class="m-0 text-sm leading-snug text-ink">
                                {phase.name}
                            </h3>
                            <span class="badge {STATUS_VARIANT[phase.status]}">
                                {#if phase.status === 'completed'}
                                    <Check class="h-3 w-3 shrink-0" aria-hidden="true" />
                                {/if}
                                {STATUS_LABEL[phase.status]}
                            </span>
                        </div>
                        <span class="text-xs text-accent-ink">
                            {formatPhaseRange(phase.startsAt, phase.endsAt)}
                        </span>
                        {#if phase.description}
                            <p class="m-0 text-xs leading-snug text-ink-2">
                                {phase.description}
                            </p>
                        {/if}

                        <!-- What the phase is planned for. Plain neutral badges,
                             never ticked off against what is switched on: that
                             comparison is the organiser's business and lives on the
                             manage page, and flagging "vote not enabled" at a
                             participant would report a problem they cannot act on.
                             Dimmed on every phase but the current one, because it is
                             reference information about a phase not yet reached. -->
                        {#if phase.capabilities.length > 0}
                            <div
                                class="flex flex-wrap items-baseline gap-1 pt-0.5
                                       {phase.status === 'current' ? '' : 'opacity-60'}"
                            >
                                <span class="meta">
                                    Planned for this phase:
                                </span>
                                {#each phase.capabilities as capability (capability)}
                                    <span class="badge badge-neutral">
                                        {capabilityLabel(capability) ?? 'Unknown'}
                                    </span>
                                {/each}
                            </div>
                        {/if}

                        {#if phase.pageId}
                            <div class="flex flex-wrap items-center gap-3 pt-1">
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
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ol>
    {/if}
</div>
