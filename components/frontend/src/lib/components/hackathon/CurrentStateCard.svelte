<script lang="ts">
    import { ArrowRight, Check } from 'lucide-svelte';
    import { capabilityHref } from '$lib/navigation/capabilityLinks';
    import { PHASE_CAPABILITIES, formatPhaseRange } from '$lib/utils/phase';

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
    const closed = $derived(PHASE_CAPABILITIES.filter((c) => !enabled.includes(c.value)));

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
    const closedHeading = $derived(organiserVoice ? 'Not open to participants' : 'Not open');

    // The two conditions deliberately kept out of the banner (see `stateAlerts`):
    // untidy rather than blocking, so an organiser reads them here without being
    // interrupted by them elsewhere.
    const noCurrentPhase = $derived(organiserVoice && hasState && currentPhase === null);
    const phaseEnded = $derived(
        organiserVoice && currentPhase?.endsAt !== undefined && currentPhase.endsAt < new Date(),
    );
</script>

<!--
  What is true of this hackathon at this moment: where we are, and what that
  lets people do. Deliberately the *actual* capability state rather than the
  current phase's plan — the participant timeline shows the plan, and the two
  genuinely disagree, because advancing a phase grants nobody anything.

  `border-line-strong` rather than the plain `card` its siblings use: this one
  leads the page and is different in kind from the About and Projects cards
  below it. Same distinction CapabilitiesPanel draws for the same reason.
-->
<section class="card flex flex-col gap-4 border-line-strong p-5" aria-labelledby="right-now">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
        <span class="meta" id="right-now">Right now</span>
        {#if currentPhase}
            <span class="badge badge-info">{phaseBadge}</span>
        {/if}
    </div>

    {#if currentPhase}
        <div class="flex flex-col gap-1">
            <h2 class="m-0 text-section text-ink">{currentPhase.name}</h2>
            <span class="tnum text-xs text-accent-ink">
                {formatPhaseRange(currentPhase.startsAt, currentPhase.endsAt)}
            </span>
            {#if currentPhase.description}
                <p class="m-0 pt-0.5 text-xs leading-snug text-ink-2">
                    {currentPhase.description}
                </p>
            {/if}
        </div>
    {:else}
        <p class="m-0 text-sm text-ink-3">
            No phase is running at the moment.
        </p>
    {/if}

    {#if !hasState}
        <!-- Nothing is enabled and nothing can be, so listing six closed
             capabilities would report the same fact six times. -->
        <p class="m-0 text-xs text-ink-2">
            {organiserVoice
                ? 'This hackathon has no configuration record, so participants cannot do anything yet.'
                : 'Nothing is open yet.'}
        </p>
    {:else}
        {#if isWaiting}
            <!-- Ahead of the list, not after it: every capability check also
                 requires a confirmed membership, so an unqualified "you can now"
                 above this line would already have misled them. -->
            <p class="m-0 text-xs text-warning-ink">
                You are on the waitlist — these open once an organiser approves you.
            </p>
        {/if}

        {#if open.length > 0}
            <div class="flex flex-col gap-1.5">
                <span class="meta">{openHeading}</span>
                <div class="flex flex-wrap gap-1.5">
                    {#each open as capability (capability.value)}
                        {@const href = linked ? capabilityHref(hackathonId, capability.value) : undefined}
                        <!-- The tick is the "open" signal and stays on both
                             shapes; the arrow only says it is also a way in. -->
                        {#if href}
                            <!-- eslint-disable svelte/no-navigation-without-resolve -- built with
                                 resolve() in $lib/navigation/capabilityLinks; the rule only
                                 recognizes a literal resolve() call in the attribute itself. -->
                            <a {href} class="badge badge-success no-underline hover:underline">
                                <Check class="h-3 w-3 shrink-0" aria-hidden="true" />
                                {capability.label}
                                <ArrowRight class="h-3 w-3 shrink-0" aria-hidden="true" />
                            </a>
                            <!-- eslint-enable svelte/no-navigation-without-resolve -->
                        {:else}
                            <span class="badge badge-success">
                                <Check class="h-3 w-3 shrink-0" aria-hidden="true" />
                                {capability.label}
                            </span>
                        {/if}
                    {/each}
                </div>
            </div>
        {:else}
            <p class="m-0 text-xs text-ink-2">
                {organiserVoice
                    ? 'Nothing is switched on for participants.'
                    : 'Nothing is open right now.'}
            </p>
        {/if}

        {#if closed.length > 0}
            <div class="flex flex-col gap-1.5">
                <span class="meta">{closedHeading}</span>
                <div class="flex flex-wrap gap-1.5">
                    {#each closed as capability (capability.value)}
                        <!-- Neutral, never danger: closed is the normal state of
                             most of these for most of the hackathon, not a fault. -->
                        <span class="badge badge-neutral opacity-70">{capability.label}</span>
                    {/each}
                </div>
            </div>
        {/if}
    {/if}

    {#if nextPhase}
        <span class="tnum border-t border-line pt-3 text-xs text-ink-3">
            Next: <span class="font-semibold text-ink-2">{nextPhase.name}</span>
            · {formatPhaseRange(nextPhase.startsAt, nextPhase.endsAt)}
        </span>
    {/if}

    {#if noCurrentPhase || phaseEnded}
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
        </div>
    {/if}
</section>
