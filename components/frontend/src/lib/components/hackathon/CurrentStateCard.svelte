<script lang="ts">
    import { ArrowRight, Check } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import { capabilityHref } from '$lib/navigation/capabilityLinks';
    import { PHASE_CAPABILITIES, capabilityDescription, formatPhaseRange } from '$lib/utils/phase';
    import { nextBoundary } from '$lib/utils/relativeTime';
    import Countdown from './Countdown.svelte';

    let {
        hackathonId,
        organiserVoice,
        isWaiting,
        hasState,
        declared,
        currentPhase,
        nextPhase,
        enabled,
    }: {
        hackathonId: string;
        /**
         * Voice the card in the third person.
         *
         * Capabilities grant to the `Member` role and casbin has no inheritance,
         * so an owner holds none of what these switch on and would be refused
         * every *action* listed as open. Saying "you can now" to them is a lie —
         * the same reason CapabilitiesPanel says "participants, never you".
         *
         * Affects the wording only, not the links: see `linked` below, where the
         * distinction between an action and the page it lives on decides those.
         *
         * True for a global admin too, who may not hold a membership row at all.
         * They can be a plain member of some other hackathon; here the
         * third-person reading is the one that is never wrong.
         */
        organiserVoice: boolean;
        /** Every capability check also requires a confirmed membership. */
        isWaiting: boolean;
        /** False when the hackathon has no HackathonState row at all. */
        hasState: boolean;
        /** True when an organiser declared this phase, false when the dates did. */
        declared: boolean;
        currentPhase: {
            name: string;
            description: string;
            startsAt?: Date;
            endsAt?: Date;
        } | null;
        nextPhase: { name: string; startsAt?: Date; endsAt?: Date } | null;
        /** Capability numbers actually switched on. */
        enabled: number[];
    } = $props();

    const open = $derived(PHASE_CAPABILITIES.filter((c) => enabled.includes(c.value)));

    // Links only where following one leads somewhere the viewer is let in.
    //
    // Organisers get them too, deliberately. Every destination here is a *page*,
    // not the capability-gated action on it, and casbin grants `Owner` the read
    // it needs outright: `project:read` and `project:propose`, `submission:read`,
    // `vote_category:read`, `vote_result:read` (`rbac.go:172-227`), none of them
    // touched by `SetCapabilities`. So an owner can open all five — and following
    // one is how they see what a participant sees.
    //
    // A waitlisted viewer is the case that must not be linked: the `member` role
    // arrives with `ApproveParticipant`, not with `Join`, so they hold none of
    // those reads and every one of these would 403.
    const linked = $derived(!isWaiting && hasState);

    // "Current phase" is a declaration, "In progress" is the calendar — the same
    // two labels the timeline pages use, so no two surfaces name it differently.
    const phaseBadge = $derived(declared ? 'Current phase' : 'In progress');

    const openHeading = $derived(organiserVoice ? 'Participants can now' : 'You can now');

    // Which boundary to count down to, decided here so the card knows whether
    // there is one at all. `new Date()` is only ever compared against, never
    // rendered — the visible clock lives in `Countdown`, which is what keeps this
    // from becoming a hydration mismatch.
    const boundary = $derived(nextBoundary(currentPhase, nextPhase, new Date(), declared));

    // The two conditions deliberately kept out of the banner (see `stateAlerts`):
    // untidy rather than blocking, so an organiser reads them here without being
    // interrupted by them elsewhere.
    //
    // Both stay organiser-only, because both are prompts to act. A participant
    // reading "no phase is declared current" learns nothing they can use — with no
    // declaration the dates decide, which is what a timeline looks like anyway.
    const noCurrentPhase = $derived(organiserVoice && hasState && currentPhase === null);
    const phaseEnded = $derived(
        organiserVoice && currentPhase?.endsAt !== undefined && currentPhase.endsAt < new Date(),
    );

    // The participant's version of the same fact, and the one thing manual mode
    // owes them: with a phase declared current the dates on this card and on the
    // timeline have stopped deciding anything, so a window that disagrees with the
    // clock is not a mistake and not something to plan around.
    //
    // Both directions, unlike `phaseEnded` above: an organiser who declares a
    // phase early leaves a "current" phase whose start is still days off, which
    // reads just as oddly as one held past its end. Suppressing the countdown
    // (see `nextBoundary`) removes the false statement; this is what replaces it.
    //
    // A declared phase whose window still covers now says nothing — the dates and
    // the declaration agree, and there is nothing to explain.
    const outsideWindow = $derived.by(() => {
        if (!declared || !currentPhase) return false;
        const now = new Date();
        return (
            (currentPhase.endsAt !== undefined && currentPhase.endsAt < now) ||
            (currentPhase.startsAt !== undefined && currentPhase.startsAt > now)
        );
    });
    const datesAreAGuide = $derived(!organiserVoice && outsideWindow);
</script>

<!--
  What is true of this hackathon at this moment: where we are, how long that
  lasts, and what it lets people do. Deliberately the *actual* capability state
  rather than the current phase's plan — the participant timeline shows the plan,
  and the two genuinely disagree, because advancing a phase grants nobody
  anything.

  The open capabilities are rows rather than pills because they are this page's
  real navigation: each is the way in to the thing a participant came to do. As
  pills they were 20px targets carrying the same visual weight as the list of
  closed ones beside them.

  What is *closed* is not listed at all any more. Five of the six capabilities are
  shut for most of a hackathon, so the line was always present and never told
  anyone anything they could act on — and the question behind it is never "is
  voting closed" but "when does it open", which this card cannot answer and the
  timeline can. The "Next" line at the foot now leads there.

  `border-line-strong` rather than the plain `card` its siblings use: this one
  leads the page and is different in kind from the cards below it. Same
  distinction CapabilitiesPanel draws for the same reason.
-->
<section class="card flex flex-col gap-4 border-line-strong p-5" aria-labelledby="right-now">
    <span class="meta">Right now</span>

    <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {#if currentPhase}
                <h2 class="m-0 text-section text-ink" id="right-now">{currentPhase.name}</h2>
                <span class="badge badge-info">{phaseBadge}</span>
            {:else}
                <h2 class="m-0 text-section text-ink-3" id="right-now">No phase is running</h2>
            {/if}
            {#if boundary}
                <span class="ms-auto"><Countdown {boundary} /></span>
            {/if}
        </div>

        {#if currentPhase}
            <span class="tnum text-xs text-ink-3">
                {formatPhaseRange(currentPhase.startsAt, currentPhase.endsAt)}
            </span>
            {#if currentPhase.description}
                <p class="prose m-0 pt-1 text-xs">{currentPhase.description}</p>
            {/if}
        {/if}
    </div>

    {#if !hasState}
        <!-- Nothing is enabled and nothing can be, so listing six closed
             capabilities would report the same fact six times. -->
        <p class="prose m-0 text-xs">
            {organiserVoice
                ? 'This hackathon has no configuration record, so participants cannot do anything yet.'
                : 'Nothing is open yet.'}
        </p>
    {:else}
        {#if isWaiting}
            <!-- Ahead of the list, not after it: every capability check also
                 requires a confirmed membership, so an unqualified "you can now"
                 above this line would already have misled them. -->
            <p class="prose m-0 text-xs text-warning-ink">
                You are on the waitlist — these open once an organiser approves you.
            </p>
        {/if}

        {#if open.length > 0}
            <div class="flex flex-col gap-2">
                <span class="meta">{openHeading}</span>
                {#each open as capability (capability.value)}
                    {@const href = linked
                        ? capabilityHref(hackathonId, capability.value)
                        : undefined}
                    {@const description = capabilityDescription(capability.value)}
                    {#if href}
                        <!-- eslint-disable svelte/no-navigation-without-resolve -- built with
                             resolve() in $lib/navigation/capabilityLinks; the rule only
                             recognizes a literal resolve() call in the attribute itself. -->
                        <a
                            {href}
                            class="group flex items-start gap-3 rounded-card bg-raised p-3
                                   no-underline hover:bg-overlay"
                        >
                            <Check
                                class="mt-0.5 h-4 w-4 shrink-0 text-success-ink"
                                aria-hidden="true"
                            />
                            <span class="flex min-w-0 flex-col gap-0.5">
                                <span class="text-sm font-semibold text-ink"
                                    >{capability.label}</span
                                >
                                {#if description}
                                    <span class="font-sans text-xs text-ink-3">{description}</span>
                                {/if}
                            </span>
                            <ArrowRight
                                class="mt-0.5 ms-auto h-4 w-4 shrink-0 text-ink-3
                                       group-hover:text-accent-ink"
                                aria-hidden="true"
                            />
                        </a>
                        <!-- eslint-enable svelte/no-navigation-without-resolve -->
                    {:else}
                        <!-- Open, but with nowhere to send them: `Register` happens
                             on the dashboard, and a waitlisted viewer would be
                             refused every destination. Same row without the arrow,
                             so nothing looks clickable that is not. -->
                        <div class="flex items-start gap-3 rounded-card bg-raised p-3">
                            <Check
                                class="mt-0.5 h-4 w-4 shrink-0 text-success-ink"
                                aria-hidden="true"
                            />
                            <span class="flex min-w-0 flex-col gap-0.5">
                                <span class="text-sm font-semibold text-ink"
                                    >{capability.label}</span
                                >
                                {#if description}
                                    <span class="font-sans text-xs text-ink-3">{description}</span>
                                {/if}
                            </span>
                        </div>
                    {/if}
                {/each}
            </div>
        {:else}
            <p class="prose m-0 text-xs">
                {organiserVoice
                    ? 'Nothing is switched on for participants.'
                    : 'Nothing is open right now.'}
            </p>
        {/if}
    {/if}

    {#if nextPhase}
        <!-- A link rather than a statement: this is the one forward-looking line on
             the card, and the timeline is where the rest of the answer is — the
             whole sequence, and how long until this phase hands over. Everyone who
             can read this card can read that page. -->
        <a
            href={resolve(`/my/hackathon/${hackathonId}/timeline`)}
            class="group flex flex-wrap items-baseline gap-x-2 border-t border-line pt-3
                   text-xs text-ink-3 no-underline"
        >
            <span class="tnum group-hover:underline">
                Next: <span class="font-semibold text-ink-2">{nextPhase.name}</span>
                · {formatPhaseRange(nextPhase.startsAt, nextPhase.endsAt)}
            </span>
            <ArrowRight
                class="h-3 w-3 shrink-0 self-center text-ink-3 group-hover:text-accent-ink"
                aria-hidden="true"
            />
        </a>
    {/if}

    {#if noCurrentPhase || phaseEnded || datesAreAGuide}
        <div class="flex flex-col gap-1 border-t border-line pt-3">
            {#if noCurrentPhase}
                <span class="text-xs text-ink-3">
                    No phase is declared current, so the timeline follows the dates alone.
                </span>
            {/if}
            {#if phaseEnded}
                <span class="text-xs text-ink-3">
                    This phase's dates have passed — it stays current until you change it.
                </span>
            {/if}
            {#if datesAreAGuide}
                <span class="text-xs text-ink-3">
                    The organisers decide when the hackathon moves on, so the dates on the
                    timeline are a guide rather than a deadline.
                </span>
            {/if}
        </div>
    {/if}
</section>
