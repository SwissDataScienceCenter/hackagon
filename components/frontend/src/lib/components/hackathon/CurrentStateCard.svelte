<script lang="ts">
    import { ArrowRight, Check, Circle } from 'lucide-svelte';
    import { capabilityHref } from '$lib/navigation/capabilityLinks';
    import { nextStep, type MyProgress, type NextStep } from '$lib/navigation/nextSteps';
    import { ALL_CAPABILITIES, capabilityDescription } from '$lib/utils/phase';

    let {
        hackathonId,
        organiserVoice,
        isWaiting,
        hasState,
        enabled,
        progress,
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
        /** Capability numbers actually switched on. */
        enabled: number[];
        /** The viewer's own part so far. Read only in the participant voice. */
        progress: MyProgress;
    } = $props();

    const open = $derived(ALL_CAPABILITIES.filter((c) => enabled.includes(c.value)));

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

    const openHeading = $derived(organiserVoice ? 'Participants can now' : 'Your next steps');

    // One row per open capability, in two voices.
    //
    // A participant gets where *they* stand: a step already taken is done and
    // points at what they did, one not taken is the next thing to do (see
    // `nextStep`). Register has no row — they have already joined. Every row used
    // to carry the same check, which read as "done" when it only meant "open".
    //
    // An organiser keeps the hackathon-wide sentence and the check for "open":
    // none of the personal states are about them, and Register is still worth
    // knowing about from their side.
    const rows = $derived.by((): (NextStep & { value: number })[] => {
        if (organiserVoice) {
            return open.map((c) => ({
                value: c.value,
                label: c.label,
                description: capabilityDescription(c.value) ?? '',
                done: true,
                href: linked ? capabilityHref(hackathonId, c.value) : undefined,
            }));
        }
        return open.flatMap((c) => {
            const step = nextStep(hackathonId, c.value, progress);
            if (!step) return [];
            return [{ value: c.value, ...step, href: linked ? step.href : undefined }];
        });
    });
</script>

<!--
  What this hackathon lets people do at this moment. Deliberately the *actual* capability state
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
  timeline can.

  Nor is anything about phases. The running phase used to head this card and is
  now `CurrentPhaseCard` above it. A "Next: <phase>" line and notes on stale
  phase dates used to close it. The card is about what the viewer can do now,
  and the sequence of phases is on About and Timeline, a click away.

  `border-line-strong` rather than the plain `card` its siblings use: this one
  leads the page and is different in kind from the cards below it. Same
  distinction CapabilitiesPanel draws for the same reason.
-->

<!-- A check only for what is done (or, for an organiser, open); a step still to
     take gets an empty circle, so the list reads as a to-do list rather than a
     row of ticks the viewer never earned. -->
{#snippet rowBody(row: NextStep)}
    {#if row.done}
        <Check class="mt-0.5 h-4 w-4 shrink-0 text-success-ink" aria-hidden="true" />
    {:else}
        <Circle class="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
    {/if}
    <span class="flex min-w-0 flex-col gap-0.5">
        <span class="text-sm font-semibold text-ink">{row.label}</span>
        {#if row.description}
            <span class="font-sans text-xs text-ink-3">{row.description}</span>
        {/if}
    </span>
{/snippet}

<!-- Named by its heading for a screen reader, which also needs it as a landmark
     when the list below is empty: an unnamed <section> is not one. -->
<section class="card flex flex-col gap-4 border-line-strong p-5" aria-label={openHeading}>
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

        {#if rows.length > 0}
            <div class="flex flex-col gap-2">
                <span class="meta">{openHeading}</span>
                {#each rows as row (row.value)}
                    {#if row.href}
                        <!-- eslint-disable svelte/no-navigation-without-resolve -- built with
                             resolve() in $lib/navigation/capabilityLinks and nextSteps; the
                             rule only recognizes a literal resolve() call in the attribute
                             itself. -->
                        <a
                            href={row.href}
                            class="group flex items-start gap-3 rounded-card bg-raised p-3
                                   no-underline hover:bg-overlay"
                        >
                            {@render rowBody(row)}
                            <ArrowRight
                                class="mt-0.5 ms-auto h-4 w-4 shrink-0 text-ink-3
                                       group-hover:text-accent-ink"
                                aria-hidden="true"
                            />
                        </a>
                        <!-- eslint-enable svelte/no-navigation-without-resolve -->
                    {:else}
                        <!-- Open, but with nowhere to send them: `Register` happens
                             on the dashboard, submitting needs a team, and a
                             waitlisted viewer would be refused every destination.
                             Same row without the arrow, so nothing looks clickable
                             that is not. -->
                        <div class="flex items-start gap-3 rounded-card bg-raised p-3">
                            {@render rowBody(row)}
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

</section>
