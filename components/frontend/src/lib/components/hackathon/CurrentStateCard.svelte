<script lang="ts">
    import { ArrowRight } from 'lucide-svelte';
    import {
        capabilityAction,
        capabilityAllows,
        capabilityDescription,
        capabilityHref,
        capabilityIsComing,
        capabilityStateLabel,
        knownCapabilityRows,
    } from '$lib/utils/capability';
    import { formatPhaseRange } from '$lib/utils/phase';
    import { nextBoundary } from '$lib/utils/relativeTime';
    import Countdown from './Countdown.svelte';

    /**
     * What a participant can do in this hackathon right now.
     *
     * Adapted from main twice over. First adapted the ORIGINAL CurrentStateCard
     * from main's flat on/off model to this branch's four-state Capability model
     * — OPEN and UNGOVERNED are both "go ahead" (the server's `Allowed` says so),
     * COMING gets its own answer with a date because "not yet" and "no longer"
     * are different plans for someone's afternoon, and CLOSED is left out
     * entirely because what is over is not news. The organiser's
     * `CapabilitiesPanel` is where all four are told apart.
     *
     * Second, ported main's later `rebuild the hackathon overview around what
     * changes`: the countdown to the next phase boundary, the phase's own dates
     * and description, and third-person wording for an organiser reading their
     * own event. What did NOT come across from that commit: `enabled: number[]`
     * (would have collapsed UNGOVERNED back into "closed"), and the `isWaiting`
     * link gate (this branch lets a waitlisted member propose — see
     * `.claude/CLAUDE.md`'s pinned policy decisions — so blocking every
     * capability link for them would be wrong here, not just untested).
     *
     * Raw numbers rather than the generated enum: this is a component, and
     * `$lib/server/**` is server-only.
     */
    let {
        hackathonId,
        capabilities = [],
        currentPhase = null,
        nextPhase = null,
        declared = false,
        organiserVoice = false,
    }: {
        hackathonId: string;
        /** As `Hackathon.capabilities` arrives: `{ capability, state, opensAt? }`. */
        capabilities?: { capability: number; state: number; opensAt?: Date }[];
        currentPhase?: {
            name: string;
            description: string;
            startsAt?: Date;
            endsAt?: Date;
        } | null;
        nextPhase?: { name: string; startsAt?: Date; endsAt?: Date } | null;
        /** True when an organiser declared this phase, false when the dates did. */
        declared?: boolean;
        /**
         * Voice the card in the third person, the same reason
         * `CapabilitiesPanel` says "participants, never you": capabilities grant
         * to `Member` and casbin has no inheritance, so an owner holds none of
         * what these switch on and "you can now" would be a lie to them.
         */
        organiserVoice?: boolean;
    } = $props();

    // Named ones only, in the table's order. A capability this build has no
    // label for is one the UI does not understand, and guessing a name for it
    // would be worse than leaving it out.
    const named = $derived(knownCapabilityRows(capabilities));
    const open = $derived(named.filter((c) => capabilityAllows(c.state)));
    const coming = $derived(named.filter((c) => capabilityIsComing(c.state)));

    const phaseBadge = $derived(declared ? 'Current phase' : 'In progress');
    const openHeading = $derived(organiserVoice ? 'Participants can now' : 'You can now');

    const boundary = $derived(nextBoundary(currentPhase, nextPhase, new Date()));
</script>

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

    {#if open.length === 0 && coming.length === 0}
        <!-- Everything is CLOSED, or there is nothing to say. Naming what is
             over would be a list of things nobody can act on. -->
        <p class="m-0 text-sm text-ink-3">
            This event has not published a schedule. Everything the organisers have set
            up is available from the menu.
        </p>
    {:else}
        {#if open.length > 0}
            <div class="flex flex-col gap-2">
                <span class="meta">{openHeading}</span>
                <ul class="m-0 flex list-none flex-col gap-2 p-0">
                    {#each open as c (c.capability)}
                        {@const href = capabilityHref(hackathonId, c.capability)}
                        {@const description = capabilityDescription(c.capability)}
                        <li>
                            {#if href}
                                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- built with resolve() in $lib/utils/capability -->
                                <a
                                    {href}
                                    class="group flex items-start gap-3 rounded-card bg-raised
                                           p-3 no-underline hover:bg-overlay"
                                >
                                    <span class="flex min-w-0 flex-col gap-0.5">
                                        <span class="text-sm font-semibold text-ink"
                                            >{capabilityAction(c.capability)}</span
                                        >
                                        {#if description}
                                            <span class="font-sans text-xs text-ink-3"
                                                >{description}</span
                                            >
                                        {/if}
                                    </span>
                                    <ArrowRight
                                        class="mt-0.5 ms-auto h-4 w-4 shrink-0 text-ink-3
                                               group-hover:text-accent-ink"
                                        aria-hidden="true"
                                    />
                                </a>
                            {:else}
                                <!-- Open, but with nowhere to send them: Register
                                     happens on the dashboard, not a page under this
                                     hackathon. -->
                                <div class="flex items-start gap-3 rounded-card bg-raised p-3">
                                    <span class="flex min-w-0 flex-col gap-0.5">
                                        <span class="text-sm font-semibold text-ink"
                                            >{capabilityAction(c.capability)}</span
                                        >
                                        {#if description}
                                            <span class="font-sans text-xs text-ink-3"
                                                >{description}</span
                                            >
                                        {/if}
                                    </span>
                                </div>
                            {/if}
                        </li>
                    {/each}
                </ul>
            </div>
        {/if}

        {#if coming.length > 0}
            <!-- "Not yet" and "no longer" are different answers, and a
                 participant planning their day needs the difference. The date
                 comes off the capability's own row, which is the reason COMING
                 is a state rather than a flavour of closed. -->
            <div class="flex flex-col gap-1">
                <span class="field-label">Not open yet</span>
                <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
                    {#each coming as c (c.capability)}
                        <li>
                            <span class="badge badge-warning">
                                {capabilityAction(c.capability)} — {capabilityStateLabel(
                                    c.state,
                                    c.opensAt
                                )}
                            </span>
                        </li>
                    {/each}
                </ul>
            </div>
        {/if}
    {/if}

    {#if nextPhase}
        <span class="tnum border-t border-line pt-3 text-xs text-ink-3">
            Next: <span class="font-semibold text-ink-2">{nextPhase.name}</span>
            · {formatPhaseRange(nextPhase.startsAt, nextPhase.endsAt)}
        </span>
    {/if}
</section>
