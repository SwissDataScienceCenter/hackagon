<script lang="ts">
    import { CircleAlert } from 'lucide-svelte';
    import { capabilityLabel } from '$lib/utils/phase';

    let {
        currentPhaseName,
        hasState,
        capabilities,
        unmet,
        message,
        saved = false,
    }: {
        /** Named in the mismatch warning; empty when no phase is declared current. */
        currentPhaseName: string;
        /** False when the hackathon has no HackathonState row to configure. */
        hasState: boolean;
        capabilities: { value: number; enabled: boolean }[];
        /** Capabilities the current phase expects that are switched off. */
        unmet: number[];
        /** Failure text from the last action, if it failed. */
        message?: string;
        saved?: boolean;
    } = $props();

    // "vote and view results" / "vote, view results and register" — read out inside
    // a sentence, so it has to be prose rather than a chip list.
    const unmetNames = $derived(
        unmet.map((c) => (capabilityLabel(c) ?? 'Unknown').toLowerCase())
    );
    const unmetSentence = $derived(
        unmetNames.length <= 1
            ? (unmetNames[0] ?? '')
            : `${unmetNames.slice(0, -1).join(', ')} and ${unmetNames.at(-1)}`
    );
</script>

<!-- Deliberately a different surface from the phase cards, which are
     bg-surface-100-900 with a surface-200-800 border: this is hackathon-wide
     configuration rather than one of the phases, and the contrast is what stops
     the two being read as the same kind of thing.
     surface-50-950 rather than plain white so it survives dark mode — it is the
     pair the form fields already use — with a slightly stronger border so the
     difference still reads in light mode, where 50 and 100 are close. -->
<section
    class="flex flex-col gap-4 border border-surface-300-700 bg-surface-50-950 px-5 py-4"
    aria-labelledby="capabilities-heading"
>
    {#if hasState}
        <form method="POST" action="?/saveCapabilities" class="flex flex-col gap-3">
            <fieldset class="m-0 flex flex-col gap-1 border-0 p-0">
                <legend class="p-0" id="capabilities-heading">
                    <span class="text-sm font-bold text-surface-950-50">
                        What participants can do
                    </span>
                </legend>
                <!-- "Participants", never "you": capabilities grant to the Member
                     role and casbin has no inheritance, so an owner holds none of
                     them and is refused the very actions they switch on here. -->
                <p class="m-0 text-xs text-surface-500">
                    Applies to the whole hackathon. Moving between phases never changes
                    these — they are always explicit.
                </p>
                <div class="grid gap-2 pt-2 sm:grid-cols-2">
                    {#each capabilities as capability (capability.value)}
                        <label class="flex items-center gap-2 text-xs text-surface-950-50">
                            <input
                                type="checkbox"
                                name="capabilities"
                                value={capability.value}
                                checked={capability.enabled}
                                class="checkbox shrink-0"
                            />
                            {capabilityLabel(capability.value) ?? 'Unknown'}
                        </label>
                    {/each}
                </div>
            </fieldset>

            {#if message}
                <p class="m-0 text-xs text-error-500" role="alert">{message}</p>
            {:else if saved}
                <p class="m-0 text-xs text-success-700-300" role="status">Saved.</p>
            {/if}

            <!-- Ticking boxes and then pressing a phase button below discards the
                 ticks: these are separate forms, and the phase POST re-renders the
                 checkboxes from server state. Considered and accepted — the two
                 areas are visually distinct, and guarding it would need client
                 state for a small win. -->
            <button type="submit" class="btn btn-sm w-fit preset-filled-primary-500">
                Save changes
            </button>
        </form>

        <!-- The gap between what a phase is for and what is actually switched on.
             Nothing closes it automatically — that is the deliberate design — so
             this names it and offers the one click. It lives here rather than on
             the phase row because the fix is a switch. -->
        {#if unmet.length > 0}
            <div
                class="flex flex-col gap-2 border border-warning-500/40 bg-warning-500/10 px-4 py-3"
                role="status"
            >
                <div class="flex items-start gap-2">
                    <CircleAlert
                        class="mt-0.5 h-4 w-4 shrink-0 text-warning-700-300"
                        aria-hidden="true"
                    />
                    <p class="m-0 text-xs text-surface-600-400">
                        <strong class="font-semibold text-surface-950-50">{currentPhaseName}</strong>
                        is meant to include
                        <strong class="font-semibold text-surface-950-50">{unmetSentence}</strong>,
                        which participants cannot do yet.
                    </p>
                </div>
                <form method="POST" action="?/applyPhaseCapabilities">
                    <button type="submit" class="btn btn-sm w-fit preset-filled-warning-500">
                        {unmet.length === 1 ? 'Enable it' : `Enable those ${unmet.length}`}
                    </button>
                </form>
                <span class="text-xs text-surface-500">
                    Only switches things on — nothing already allowed is turned off.
                </span>
            </div>
        {/if}
    {:else}
        <h3 id="capabilities-heading" class="m-0 text-sm font-bold text-surface-950-50">
            What participants can do
        </h3>
        <p class="m-0 text-xs text-surface-600-400">
            This hackathon has no configuration record, so what participants may do cannot
            be changed here. That is a data problem rather than a setting — every
            hackathon created through the app has one.
        </p>
    {/if}
</section>
