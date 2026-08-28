<script lang="ts">
    import { FileText } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import Countdown from '$lib/components/hackathon/Countdown.svelte';
    import { ALL_CAPABILITIES, formatPhaseRange } from '$lib/utils/phase';
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

    // What is actually switched on, in enum order rather than in whatever order
    // the state arrived in. `data.enabled` is HackathonState — the real thing —
    // not the live phase's capability tags, which are a plan and can disagree.
    const open = $derived(ALL_CAPABILITIES.filter((c) => data.enabled.includes(c.value)));
    const openLine = $derived(open.map((c) => c.label).join(' · '));

    // The rail's two half-segments per row, coloured from that row's own status
    // rather than from its index: accent where the hackathon has been, neutral
    // where it has not. A row's upper half is accent once progress has *reached*
    // it, its lower half only once progress has *passed* it — so the live phase
    // is exactly where the accent stops.
    const reached = (s: PageData['phases'][number]['status']) => s !== 'upcoming';
    const passed = (s: PageData['phases'][number]['status']) => s === 'completed';
</script>

<!--
  What is happening and when, and nothing to act on: adding, editing and
  declaring a current phase live on the Manage Timeline page (see $lib/navigation's
  manageNav), together with the capability switches.

  A rail rather than a stack of equal cards. Only the live phase is a card, so the
  page has one focal point instead of one per phase; everything else is a row on
  the canvas, and completed phases collapse to a line, being history. Where we are
  is then readable from the rail alone, which is why only the live row carries a
  status badge — the rest say it to a screen reader and to nobody else.

  The one capability line here is `HackathonState`, never the live phase's
  *planned* capabilities: advancing a phase grants nobody anything, so the plan
  can promise a participant something that is switched off. Ticking the plan off
  against reality is an organiser's job and stays on Manage Timeline. The detail —
  a sentence and a link per open capability — is the overview's state card, which
  reads the same derivation; this is the short form, in sequence.

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
        <!-- No gap between rows: the connector has to run through it, so the
             spacing is padding *inside* each row instead. -->
        <ol class="m-0 flex list-none flex-col p-0">
            {#each data.phases as phase, i (phase.id)}
                {@const live = phase.id === data.livePhaseId}
                <!-- The node sits on the first text line of the row, which is
                     lower inside the live phase's card than on a bare row. Both
                     offsets are stated once here and drive the segments too, so
                     the rail cannot come apart from the text it points at. -->
                {@const nodeTop = live ? 'top-[1.35rem]' : 'top-[0.22rem]'}
                {@const upperEnd = live ? 'h-[1.35rem]' : 'h-[0.22rem]'}
                {@const lowerStart = live ? 'top-[2.1rem]' : 'top-[0.97rem]'}
                <li class="flex min-w-0 items-stretch gap-3">
                    <div class="relative w-4 shrink-0" aria-hidden="true">
                        <!-- Nothing above the first phase and nothing below the
                             last: a line running off either end would promise a
                             phase that is not there. -->
                        {#if i > 0}
                            <span
                                class="absolute left-1/2 top-0 w-px -translate-x-1/2 {upperEnd}
                                       {reached(phase.status) ? 'bg-accent/40' : 'bg-line-strong'}"
                            ></span>
                        {/if}
                        {#if i < data.phases.length - 1}
                            <span
                                class="absolute bottom-0 left-1/2 w-px -translate-x-1/2 {lowerStart}
                                       {passed(phase.status) ? 'bg-accent/40' : 'bg-line-strong'}"
                            ></span>
                        {/if}
                        <!-- Full-strength accent on exactly one node, so the eye
                             lands on where we are before it reads anything. -->
                        <span
                            class="absolute left-1/2 h-3 w-3 -translate-x-1/2 rounded-full {nodeTop}
                                   {live
                                ? 'bg-accent ring-4 ring-accent/20'
                                : passed(phase.status)
                                  ? 'bg-accent/40'
                                  : 'border border-line-strong bg-canvas'}"
                        ></span>
                    </div>

                    <div class="min-w-0 flex-1 pb-5">
                        {#if live}
                            <div class="card card-raised box-border flex flex-col gap-1.5 px-5 py-4">
                                <div class="flex flex-wrap items-center gap-2">
                                    <h3 class="m-0 text-sm leading-snug text-ink">
                                        {phase.name}
                                    </h3>
                                    <span class="badge badge-info">
                                        {STATUS_LABEL[phase.status]}
                                    </span>
                                    <!-- The question a timeline is actually asked.
                                         Renders nothing once the date has passed —
                                         a declared phase stays current after its
                                         dates run out, and inventing a countdown
                                         for that would be worse than none. -->
                                    {#if phase.endsAt}
                                        <span class="ms-auto">
                                            <Countdown
                                                boundary={{ verb: 'ends', target: phase.endsAt }}
                                            />
                                        </span>
                                    {/if}
                                </div>
                                <span class="tnum text-xs text-accent-ink">
                                    {formatPhaseRange(phase.startsAt, phase.endsAt)}
                                </span>
                                {#if phase.description}
                                    <p class="prose m-0 text-xs">{phase.description}</p>
                                {/if}

                                {#if data.hasState}
                                    <div
                                        class="flex flex-wrap items-baseline gap-x-3 gap-y-1
                                               border-t border-line pt-2"
                                    >
                                        <span class="meta">Open now</span>
                                        {#if open.length > 0}
                                            <span class="min-w-0 text-xs text-ink-2">
                                                {openLine}
                                            </span>
                                            <!-- Named as a destination, not as a
                                                 second copy: the overview's card
                                                 is where each of these carries a
                                                 sentence and a link to the page
                                                 it happens on. -->
                                            <a
                                                href={resolve(
                                                    `/my/hackathon/${data.hackathonId}/overview`
                                                )}
                                                class="ms-auto shrink-0 text-xs font-semibold
                                                       text-accent-ink no-underline hover:underline"
                                            >
                                                See the details →
                                            </a>
                                        {:else}
                                            <span class="text-xs text-ink-3">
                                                Nothing is open right now.
                                            </span>
                                        {/if}
                                    </div>
                                    {#if data.isWaiting && open.length > 0}
                                        <!-- Every capability check also requires a
                                             confirmed membership, so the line above
                                             is not yet true for them. -->
                                        <span class="text-xs text-warning-ink">
                                            You are on the waitlist — these open once an organiser
                                            approves you.
                                        </span>
                                    {/if}
                                {/if}

                                {#if phase.pageId}
                                    <a
                                        href={resolve(
                                            `/my/hackathon/${data.hackathonId}/pages/${phase.pageId}`
                                        )}
                                        class="inline-flex items-center gap-1 pt-1 text-xs
                                               font-semibold text-accent-ink no-underline
                                               hover:underline"
                                    >
                                        <FileText class="h-3 w-3 shrink-0" aria-hidden="true" />
                                        Read more
                                    </a>
                                {/if}
                            </div>
                        {:else}
                            <!-- Completed and upcoming read the same way and differ
                                 only in weight: the rail and the dates say which is
                                 which, and a badge on every row would compete with
                                 the one that matters. The status is still spoken. -->
                            <div
                                class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5
                                       {phase.status === 'completed' ? 'opacity-70' : ''}"
                            >
                                <h3 class="m-0 text-sm leading-snug text-ink-2">
                                    {phase.name}
                                    <span class="sr-only"> — {STATUS_LABEL[phase.status]}</span>
                                </h3>
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
                                <span class="ms-auto flex shrink-0 items-baseline gap-3">
                                    <!-- Withheld while a phase is declared current:
                                         nothing but SetCurrentPhase starts the next
                                         one then, so its start date arriving does
                                         nothing and "starts in 3 h" would be a
                                         promise no clock keeps. Same guard
                                         `nextBoundary` applies for the overview's
                                         card; the date beside it still says when it
                                         was scheduled for. -->
                                    {#if phase.id === data.nextPhaseId && phase.startsAt && !data.declared}
                                        <Countdown
                                            boundary={{ verb: 'starts', target: phase.startsAt }}
                                        />
                                    {/if}
                                    <span class="tnum text-xs text-ink-3">
                                        {formatPhaseRange(phase.startsAt, phase.endsAt)}
                                    </span>
                                </span>
                                <!-- Only where a phase is still ahead: what a past
                                     phase was for is not something to plan around,
                                     and the row is history at that point. -->
                                {#if phase.description && phase.status !== 'completed'}
                                    <p class="prose m-0 basis-full text-xs text-ink-3">
                                        {phase.description}
                                    </p>
                                {/if}
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ol>
    {/if}
</div>
