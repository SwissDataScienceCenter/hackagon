<script lang="ts">
    import { CircleAlert } from 'lucide-svelte';
    import {
        capabilityDescription,
        capabilityIsOn,
        capabilityIsUngoverned,
        capabilityLabel,
        capabilityStateLabel,
        capabilityStateNote,
        capabilitySubject,
        knownCapabilityRows,
    } from '$lib/utils/capability';

    /**
     * The organiser's switches for what participants may do.
     *
     * **This panel is where the four states are told apart.** It used to take a
     * boolean per capability, computed server-side as `state === OPEN`, so three
     * of our four states — COMING, CLOSED and UNGOVERNED — rendered as one
     * unticked box. "It opens on Friday", "it is switched off" and "nothing
     * governs this, so they can already do it" were the same pixel. The last of
     * those is the one that matters: UNGOVERNED means the server ALLOWS the
     * action (`capability.State.Allowed` returns true for it), so an unticked
     * box was reporting a permission as absent while participants had it.
     *
     * It therefore takes the rows exactly as `Hackathon.capabilities` sends
     * them, the same shape `CurrentStateCard` and `OrganizerStateAlert` take.
     * A projection made in a loader is a place the four states can be lost on
     * the way to the one screen whose job is to show them.
     *
     * The CHECKBOX still reflects the stored flag alone, because that is the
     * only thing `SetCapabilities` writes. The state line beside it is what
     * says which of the four we are in.
     */
    let {
        currentPhaseName,
        capabilities = [],
        unmet,
        message,
        saved = false,
    }: {
        /** Named in the mismatch warning; empty when no phase is declared current. */
        currentPhaseName: string;
        /** As `Hackathon.capabilities` arrives: `{ capability, state, opensAt? }`. */
        capabilities?: { capability: number; state: number; opensAt?: Date }[];
        /** Capabilities the current phase expects that are switched off. */
        unmet: number[];
        /** Failure text from the last action, if it failed. */
        message?: string;
        saved?: boolean;
    } = $props();

    // The table's order, with anything this build cannot name dropped — an
    // unnamed switch is one nobody can tell what they are turning on.
    const rows = $derived(knownCapabilityRows(capabilities));

    // "vote and view results" / "vote, view results and register" — read out inside
    // a sentence, so it has to be prose rather than a chip list.
    const unmetNames = $derived(unmet.map((c) => (capabilityLabel(c) ?? 'Unknown').toLowerCase()));
    const unmetSentence = $derived(
        unmetNames.length <= 1
            ? (unmetNames[0] ?? '')
            : `${unmetNames.slice(0, -1).join(', ')} and ${unmetNames.at(-1)}`
    );

    // Capabilities with no stored row. `SetCapabilities` answers NotFound for
    // any of them and refuses the WHOLE batch, and the save posts all six — so
    // one ungoverned row makes the form unusable, which the organiser should
    // read here rather than deduce from a 404.
    const ungoverned = $derived(rows.filter((c) => capabilityIsUngoverned(c.state)));
    const ungovernedSentence = $derived(
        ungoverned.map((c) => capabilitySubject(c.capability) ?? 'A capability').join(', ')
    );
</script>

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
    {#if rows.length > 0}
        <form method="POST" action="?/saveCapabilities" class="flex flex-col gap-3">
            <fieldset class="m-0 flex flex-col gap-1 border-0 p-0">
                <legend class="p-0" id="capabilities-heading">
                    <span class="text-section">What participants can do</span>
                </legend>
                <!-- "Participants", never "you": capabilities grant to the Member
                     role and casbin has no inheritance, so an owner holds none of
                     them and is refused the very actions they switch on here.

                     NOT main's "Moving between phases never changes them" — that
                     sentence describes main's model, where phases are inert
                     labels. Here a capability names the phase it opens in and
                     `AdvancePhase` switches exactly those, so main's copy would
                     be a promise this branch breaks the moment anyone advances. -->
                <p class="m-0 text-xs text-ink-3">
                    Applies to the whole hackathon. A capability that names the phase it opens
                    in moves WITH the timeline: advancing to that phase switches it on
                    here. Ones with no phase linked change only when you change them.
                </p>
                <!-- A row per capability rather than a two-column grid of bare
                     labels: six terms with nothing beside them read as settings,
                     when what is being decided is what everyone here may do. The
                     state line is the second half of that — a tick tells you what
                     you last chose, not what is true right now. -->
                <div class="flex flex-col gap-1 pt-2">
                    {#each rows as capability (capability.capability)}
                        <label
                            class="flex cursor-pointer items-start gap-2.5 rounded-field px-2 py-2
                                   hover:bg-raised"
                        >
                            <input
                                type="checkbox"
                                name="capabilities"
                                value={capability.capability}
                                checked={capabilityIsOn(capability.state)}
                                class="checkbox mt-0.5"
                            />
                            <span class="flex min-w-0 flex-col gap-0.5">
                                <span class="flex flex-wrap items-center gap-2">
                                    <span class="text-xs font-semibold text-ink">
                                        {capabilityLabel(capability.capability) ?? 'Unknown'}
                                    </span>
                                    <!-- The fact, on its own element. Four values,
                                         four different words: this is the only
                                         place an organiser can tell a scheduled
                                         opening from a closed switch from a
                                         capability nothing governs. -->
                                    <span
                                        class="badge badge-sm"
                                        class:badge-success={capability.state === 2}
                                        class:badge-warning={capability.state === 1}
                                        class:badge-neutral={capability.state === 3}
                                        class:badge-info={capability.state === 4}
                                    >
                                        {capabilityStateLabel(capability.state, capability.opensAt) ??
                                            'Unknown state'}
                                    </span>
                                </span>
                                <span class="text-xs text-ink-3">
                                    {capabilityDescription(capability.capability) ??
                                        'No description for this capability.'}
                                </span>
                                <span class="text-meta text-ink-3">
                                    {capabilityStateNote(capability.state) ??
                                        'This build does not recognise the state the server reported.'}
                                </span>
                            </span>
                        </label>
                    {/each}
                </div>
            </fieldset>

            {#if message}
                <p class="m-0 text-xs text-danger-ink" role="alert">{message}</p>
            {:else if saved}
                <p class="m-0 text-xs text-success-ink" role="status">Saved.</p>
            {/if}

            <!-- Ticking boxes and then pressing a phase button elsewhere on the
                 page discards the ticks: those are separate forms, and the other
                 POST re-renders the checkboxes from server state. Considered and
                 accepted — the two areas are visually distinct, and guarding it
                 would need client state for a small win. -->
            <!-- Outline, not solid: whichever page mounts this panel keeps its
                 own primary action, and two solid buttons would read as equal
                 footing. -->
            <button type="submit" class="btn btn-sm w-fit btn-outline-accent"> Save changes </button>
        </form>

        {#if ungoverned.length > 0}
            <!-- Not a permission check — the backend decides, and it decides by
                 refusing. This says so before the organiser spends a save on it. -->
            <p class="m-0 text-xs text-warning-ink" role="status">
                {ungovernedSentence}
                {ungoverned.length === 1 ? 'has' : 'have'} no stored setting on this hackathon, so
                the server allows
                {ungoverned.length === 1 ? 'it' : 'them'} and will refuse to save this form until the
                {ungoverned.length === 1 ? 'row exists' : 'rows exist'}.
            </p>
        {/if}

        <!-- The gap between what a phase is for and what is actually switched on.
             Nothing closes it automatically — that is the deliberate design — so
             this names it and offers the one click. It lives here rather than on
             the phase row because the fix is a switch. -->
        {#if unmet.length > 0}
            <div
                class="flex flex-col gap-2 border border-warning/40 bg-warning/10 px-4 py-3"
                role="status"
            >
                <div class="flex items-start gap-2">
                    <CircleAlert
                        class="mt-0.5 h-4 w-4 shrink-0 text-warning-ink"
                        aria-hidden="true"
                    />
                    <p class="m-0 text-xs text-ink-2">
                        <strong class="font-semibold text-ink">{currentPhaseName}</strong>
                        is meant to include
                        <strong class="font-semibold text-ink">{unmetSentence}</strong>, which
                        participants cannot do yet.
                    </p>
                </div>
                <form method="POST" action="?/applyPhaseCapabilities">
                    <button type="submit" class="btn btn-sm w-fit btn-warning">
                        {unmet.length === 1 ? 'Enable it' : `Enable those ${unmet.length}`}
                    </button>
                </form>
                <span class="text-xs text-ink-3">
                    Only switches things on — nothing already allowed is turned off.
                </span>
            </div>
        {/if}
    {:else}
        <!-- Reached only when the mount passes no rows. The server sends one
             status per capability it knows — including UNGOVERNED for the ones
             with no row — so `hackathon.capabilities` is never empty, which is
             why the `hasState` prop this replaced could never be false and its
             explanation was dead copy. Kept as an honest empty state: it now
             describes what the component was handed rather than asserting a
             database fact it cannot see. -->
        <h3 id="capabilities-heading" class="m-0 text-section text-ink">
            What participants can do
        </h3>
        <p class="m-0 text-xs text-ink-2">
            No capability settings were loaded for this hackathon, so there is nothing to
            change here.
        </p>
    {/if}
</section>
