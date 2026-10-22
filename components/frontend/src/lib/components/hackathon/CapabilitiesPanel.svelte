<script lang="ts">
    import { enhance } from '$app/forms';
    import { beforeNavigate, goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import ConfirmDialog from '$lib/components/layout/ConfirmDialog.svelte';
    import { capabilityDescription, capabilityLabel } from '$lib/utils/phase';

    let {
        hackathonId,
        isPrivate,
        hasState,
        capabilities,
        message,
        saved = false,
    }: {
        hackathonId: string;
        /** Picks the Register step's wording, and whether it links to Invitations. */
        isPrivate: boolean;
        /** False when the hackathon has no HackathonState row to configure. */
        hasState: boolean;
        /**
         * `lockedReason`, when set, is why a switch cannot be turned on yet —
         * today only "View results", until the results are final. `warnings`
         * say what turning one on means, and never stop anything.
         */
        capabilities: {
            value: number;
            enabled: boolean;
            lockedReason?: string;
            warnings?: string[];
        }[];
        /** Failure text from the last action, if it failed. */
        message?: string;
        saved?: boolean;
    } = $props();

    type Capability = (typeof capabilities)[number];

    // The switches as the steps of running a hackathon, in order, with the
    // screens between them that are not switches at all — forming teams,
    // setting up voting — so an organizer reads one walkthrough instead of
    // seven equal checkboxes. Two steps have no switch, only a link.
    //
    // Switch labels here are the organizer's ("Open registration"), not the
    // participant-facing ones in `$lib/utils/phase`, which serve the Timeline
    // and the "You can now" card. Raw enum numbers, as there: the generated enum
    // is server-only.
    type Block =
        | { kind: 'text'; text: string; link?: { href: string; label: string } }
        | { kind: 'switch'; value: number; label: string };
    type Step = { title: string; blocks: Block[] };

    const steps = $derived<Step[]>([
        {
            title: 'Register',
            blocks: [
                {
                    kind: 'text',
                    text: 'Before opening: decide what you need to know from participants.',
                    link: {
                        href: resolve(`/my/hackathon/${hackathonId}/manage/forms/registration`),
                        label: 'Registration form',
                    },
                },
                { kind: 'switch', value: 1, label: 'Open registration' },
                isPrivate
                    ? {
                          kind: 'text',
                          text: 'Private hackathon: after opening, send invitation links to participants.',
                          link: {
                              href: resolve(`/my/hackathon/${hackathonId}/manage/invites`),
                              label: 'Invitation links',
                          },
                      }
                    : {
                          kind: 'text',
                          text: 'Public hackathon: anyone can find it and join.',
                      },
                // Every join waits for approval, public or private — the backend
                // creates the participant waiting — and nothing else on this
                // page says so.
                {
                    kind: 'text',
                    text: 'Everyone who registers waits until you approve them.',
                    link: {
                        href: resolve(`/my/hackathon/${hackathonId}/participants/manage`),
                        label: 'Manage Participants',
                    },
                },
                {
                    kind: 'text',
                    text: 'Close registration when you no longer accept new participants.',
                },
            ],
        },
        {
            title: 'Projects',
            blocks: [
                { kind: 'text', text: 'Projects can come from participants:' },
                { kind: 'switch', value: 2, label: 'Participants can propose projects' },
                {
                    kind: 'text',
                    text: 'Proposals need your review. Or add all projects yourself.',
                    link: {
                        href: resolve(`/my/hackathon/${hackathonId}/projects/manage`),
                        label: 'Manage Projects',
                    },
                },
            ],
        },
        {
            title: 'Project preferences',
            blocks: [
                { kind: 'text', text: 'Once all projects are in:' },
                { kind: 'switch', value: 3, label: 'Participants can voice preferences' },
            ],
        },
        {
            title: 'Team assignments',
            blocks: [
                {
                    kind: 'text',
                    text: 'Once projects are set up and preferences are in, form the teams.',
                    link: {
                        href: resolve(`/my/hackathon/${hackathonId}/teams/manage`),
                        label: 'Manage Teams',
                    },
                },
            ],
        },
        {
            title: 'Hacking starts',
            blocks: [
                { kind: 'text', text: 'Once teams are decided:' },
                { kind: 'switch', value: 7, label: 'Participants can see teams' },
                { kind: 'switch', value: 4, label: 'Participants can submit for their team' },
            ],
        },
        {
            title: 'Set up voting',
            blocks: [
                {
                    kind: 'text',
                    // No jury voting on the platform any more: a jury's verdict
                    // never reaches the results, so publishing would show an
                    // empty list.
                    text:
                        'Categories and methods can be set up before the event. ' +
                        'If a jury decides outside the platform, leave voting and results off.',
                    link: {
                        href: resolve(`/my/hackathon/${hackathonId}/voting/manage`),
                        label: 'Set up voting',
                    },
                },
            ],
        },
        {
            title: 'Voting starts',
            blocks: [{ kind: 'switch', value: 5, label: 'Participants can vote' }],
        },
        {
            title: 'Publish results',
            blocks: [
                // The switch stays locked until the results are final, and they
                // can only be made final once voting is closed.
                {
                    kind: 'text',
                    text: 'Turn voting off, then make the results final.',
                    link: {
                        href: resolve(`/my/hackathon/${hackathonId}/voting/manage`),
                        label: 'Manage Voting',
                    },
                },
                { kind: 'switch', value: 6, label: 'Publish results' },
            ],
        },
    ]);

    const byValue = $derived(new Map(capabilities.map((c) => [c.value, c])));

    // A capability the backend adds before a step names it still gets a switch,
    // rather than silently vanishing from the only screen that sets it.
    const unplaced = $derived.by(() => {
        const placed = new Set(
            steps.flatMap((s) => s.blocks.flatMap((b) => (b.kind === 'switch' ? [b.value] : []))),
        );
        return capabilities.filter((c) => !placed.has(c.value));
    });

    // The ticks as the organizer has them, against `capabilities`, which is what
    // is saved. A writable derived: ticking overrides it, and a successful save
    // re-runs the load, hands in new `capabilities` and so resets it. A failed
    // save hands in nothing new, and the ticks stay for another try.
    let draft = $derived(
        Object.fromEntries(capabilities.map((c) => [c.value, c.enabled])) as Record<
            number,
            boolean
        >,
    );

    const changed = $derived(capabilities.filter((c) => draft[c.value] !== c.enabled));
    const dirty = $derived(changed.length > 0);

    const switchLabels = $derived(
        new Map(
            steps.flatMap((s) =>
                s.blocks.flatMap((b) => (b.kind === 'switch' ? [[b.value, b.label] as const] : [])),
            ),
        ),
    );
    const labelOf = (value: number) =>
        switchLabels.get(value) ?? capabilityLabel(value) ?? 'Unknown';

    // "Open registration on, Participants can vote off": what Save would write.
    const summary = $derived(
        changed.map((c) => `${labelOf(c.value)} ${draft[c.value] ? 'on' : 'off'}`).join(', '),
    );

    let pending = $state(false);
    let confirmDialog: ReturnType<typeof ConfirmDialog>;

    function discard() {
        draft = Object.fromEntries(capabilities.map((c) => [c.value, c.enabled]));
    }

    // Same guard as Manage Teams. A link inside the app leaves without
    // unloading the page, so `beforeunload` below never hears of it; closing or
    // reloading the tab — and the phase buttons above, which are plain form
    // posts — get the browser's own prompt instead, which no page can replace.
    //
    // The guard cannot wait for an answer, so it always cancels, asks, and on a
    // "yes" goes where the organizer was heading, with `leaving` set so it does
    // not ask twice.
    let leaving = false;

    beforeNavigate((navigation) => {
        if (leaving || !dirty || navigation.type === 'leave') return;
        const target = navigation.to?.url;
        navigation.cancel();
        if (!target) return;

        void confirmDialog
            .ask({
                title: 'Leave without saving?',
                message: `You have unsaved changes: ${summary}. They are lost if you leave.`,
                confirmLabel: 'Leave without saving',
                danger: true,
            })
            .then((leave) => {
                if (!leave) return;
                leaving = true;
                // Another site cannot be reached through the router.
                if (navigation.willUnload) window.location.href = target.href;
                // eslint-disable-next-line svelte/no-navigation-without-resolve -- the URL SvelteKit was already navigating to, resolved by whatever link started it
                else void goto(target);
            });
    });
</script>

<svelte:window
    onbeforeunload={(e) => {
        if (dirty && !leaving) e.preventDefault();
    }}
/>

<ConfirmDialog bind:this={confirmDialog} />

{#snippet toggle(capability: Capability, label: string, description?: string)}
    <!-- A locked switch is disabled, and so submits nothing — right, since it is
         only ever locked while off. The reason sits under it so it is never
         unexplained. -->
    <!-- Warning-tinted while unsaved, the same color as the bar above, so what
         Save would write is marked where it was changed. -->
    {@const unsaved = draft[capability.value] !== capability.enabled}
    <label
        class="flex items-start gap-2.5 rounded-field px-2 py-1.5
               {capability.lockedReason ? 'cursor-not-allowed' : 'cursor-pointer'}
               {unsaved ? 'bg-warning/10' : capability.lockedReason ? '' : 'hover:bg-raised'}"
        title={unsaved ? 'Changed — not saved yet' : undefined}
    >
        <input
            type="checkbox"
            name="capabilities"
            value={capability.value}
            checked={draft[capability.value]}
            onchange={(e) =>
                (draft = { ...draft, [capability.value]: e.currentTarget.checked })}
            disabled={capability.lockedReason !== undefined}
            class="checkbox mt-0.5"
        />
        <span class="flex min-w-0 flex-col gap-0.5">
            <span class="text-xs font-semibold text-ink">{label}</span>
            {#if description}
                <span class="text-xs text-ink-3">{description}</span>
            {/if}
            {#if capability.lockedReason}
                <span class="text-xs text-warning-ink">{capability.lockedReason}</span>
            {/if}
            {#each capability.warnings ?? [] as warning (warning)}
                <span class="text-xs text-warning-ink">{warning}</span>
            {/each}
        </span>
    </label>
{/snippet}

<!-- Deliberately a different surface from the phase cards, which sit on
     `raised` with a `line` border: this is hackathon-wide configuration rather
     than one of the phases, and the contrast is what stops the two being read as
     the same kind of thing. `surface` rather than a literal white so it follows
     the colour mode, with `line-strong` so the difference still reads in light
     mode, where the two backgrounds are close together. -->
<section
    class="card flex flex-col gap-4 border-line-strong px-5 py-4"
    aria-labelledby="capabilities-heading"
>
    {#if hasState}
        <!-- Enhanced, so saving stays on the page: the load re-runs, the ticks
             reset to what was saved, and the bar says so. -->
        <form
            method="POST"
            action="?/saveCapabilities"
            class="flex flex-col gap-3"
            use:enhance={() => {
                pending = true;
                return async ({ update }) => {
                    await update({ reset: false });
                    pending = false;
                };
            }}
        >
            <div class="flex flex-col gap-1">
                <h3 id="capabilities-heading" class="m-0 text-section text-ink">
                    What participants can do
                </h3>
                <!-- "Participants", never "you": capabilities grant to the Member
                     role and casbin has no inheritance, so an owner holds none of
                     them and is refused the very actions they switch on here. -->
                <p class="m-0 text-xs text-ink-3">
                    These switches decide what participants can do, and this is the only
                    place to change them. Moving between phases never does.
                </p>
            </div>

            <!-- Save lives here, and sticks below the nav bar (its `h-14` row plus
                 its 1px border) for as long as the guide is on screen, as on
                 Manage Teams. Quiet while everything is saved; warning-colored as
                 soon as anything is not, the same color as the rows that changed.
                 The wrapper is the card's own surface, so what scrolls underneath
                 stays hidden. Outline rather than solid: the solid button on this
                 page moves the phase marker. -->
            <div class="sticky top-[calc(3.5rem+1px)] z-10 bg-surface pt-0.5">
                <div
                    class="flex flex-wrap items-center gap-3 rounded-card border px-3 py-2 text-xs
                           {dirty ? 'border-warning bg-warning/10' : 'border-line bg-raised'}"
                    role="status"
                >
                    <span class="flex-1 {dirty ? 'text-warning-ink' : 'text-ink-3'}">
                        {#if pending}
                            Saving…
                        {:else if dirty}
                            Unsaved changes, marked below: {summary}
                        {:else if saved && !message}
                            <span class="text-success-ink">Saved.</span>
                        {:else}
                            No unsaved changes
                        {/if}
                    </span>
                    {#if message && !pending}
                        <span class="text-danger-ink" role="alert">{message}</span>
                    {/if}
                    <button
                        type="button"
                        class="btn btn-sm btn-ghost"
                        disabled={pending || !dirty}
                        onclick={discard}
                    >
                        Discard
                    </button>
                    <button
                        type="submit"
                        class="btn btn-sm btn-outline-accent"
                        disabled={pending || !dirty}
                    >
                        Save
                    </button>
                </div>
            </div>

            <fieldset
                class="m-0 border-0 p-0"
                aria-labelledby="capabilities-heading"
                class:opacity-60={pending}
            >
                <ol class="m-0 flex list-none flex-col p-0">
                    {#each steps as step, i (step.title)}
                        <li class="flex flex-col gap-1 border-t border-line py-3">
                            <h4 class="m-0 px-2 text-sm font-semibold text-ink">
                                <span class="tnum text-ink-3">{i + 1}.</span>
                                {step.title}
                            </h4>
                            {#each step.blocks as block, j (j)}
                                {#if block.kind === 'switch'}
                                    {@const capability = byValue.get(block.value)}
                                    {#if capability}
                                        {@render toggle(capability, block.label)}
                                    {/if}
                                {:else}
                                    <p class="m-0 px-2 text-xs text-ink-3">
                                        {block.text}
                                        {#if block.link}
                                            <!-- eslint-disable svelte/no-navigation-without-resolve -- built
                                                 with resolve() above; the rule only recognizes a literal
                                                 resolve() call in the attribute itself. -->
                                            <a
                                                href={block.link.href}
                                                class="ml-1 whitespace-nowrap font-semibold text-accent-ink
                                                       no-underline hover:underline"
                                            >
                                                {block.link.label} &rarr;
                                            </a>
                                            <!-- eslint-enable svelte/no-navigation-without-resolve -->
                                        {/if}
                                    </p>
                                {/if}
                            {/each}
                        </li>
                    {/each}

                    {#if unplaced.length > 0}
                        <li class="flex flex-col gap-1 border-t border-line py-3">
                            <h4 class="m-0 px-2 text-sm font-semibold text-ink">Other</h4>
                            {#each unplaced as capability (capability.value)}
                                {@render toggle(
                                    capability,
                                    capabilityLabel(capability.value) ?? 'Unknown',
                                    capabilityDescription(capability.value),
                                )}
                            {/each}
                        </li>
                    {/if}
                </ol>
            </fieldset>
        </form>
    {:else}
        <h3 id="capabilities-heading" class="m-0 text-section text-ink">
            What participants can do
        </h3>
        <p class="m-0 text-xs text-ink-2">
            This hackathon has no configuration record, so what participants may do cannot
            be changed here. That is a data problem rather than a setting — every
            hackathon created through the app has one.
        </p>
    {/if}
</section>
