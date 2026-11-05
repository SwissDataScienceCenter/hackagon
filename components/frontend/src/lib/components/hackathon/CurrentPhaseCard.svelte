<script lang="ts">
    import { formatPhaseRange } from '$lib/utils/phase';
    import { nextBoundary } from '$lib/utils/relativeTime';
    import Countdown from './Countdown.svelte';

    let {
        currentPhase,
        nextPhase,
        declared,
    }: {
        currentPhase: {
            name: string;
            description: string;
            startsAt?: Date;
            endsAt?: Date;
        };
        /** Only to count down to when the current phase has no end of its own. */
        nextPhase: { name: string; startsAt?: Date; endsAt?: Date } | null;
        /** True when an organiser declared this phase, false when the dates did. */
        declared: boolean;
    } = $props();

    // "Current phase" is a declaration, "In progress" is the calendar — the same
    // two labels the timeline pages use, so no two surfaces name it differently.
    const phaseBadge = $derived(declared ? 'Current phase' : 'In progress');

    // Which boundary to count down to. `new Date()` is only ever compared
    // against, never rendered — the visible clock lives in `Countdown`, which is
    // what keeps this from becoming a hydration mismatch. A declared phase held
    // outside its own dates gets none (see `nextBoundary`).
    const boundary = $derived(nextBoundary(currentPhase, nextPhase, new Date(), declared));
</script>

<!--
  The phase that is running, as a card of its own above "Your next steps".

  It used to be the header of that card, which made one box answer two
  questions: where the hackathon is, and what the viewer can do in it. They are
  different in kind — a phase is informational, and advancing it grants nobody
  anything — so they get a box each.

  Only rendered while a phase is running; the caller decides. With none there
  is nothing to say here, and the sequence of phases is on About and Timeline.
-->
<section class="card flex flex-col gap-1 p-5" aria-labelledby="current-phase">
    <span class="meta pb-2">Right now</span>
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="m-0 text-section text-ink" id="current-phase">{currentPhase.name}</h2>
        <span class="badge badge-info">{phaseBadge}</span>
        {#if boundary}
            <span class="ms-auto"><Countdown {boundary} /></span>
        {/if}
    </div>

    <span class="tnum text-xs text-ink-3">
        {formatPhaseRange(currentPhase.startsAt, currentPhase.endsAt)}
    </span>
    {#if currentPhase.description}
        <p class="prose m-0 pt-1 text-xs">{currentPhase.description}</p>
    {/if}
</section>
