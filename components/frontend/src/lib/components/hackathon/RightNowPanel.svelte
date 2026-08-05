<script lang="ts">
    import { CircleAlert } from 'lucide-svelte';
    import { capabilityLabel } from '$lib/utils/phase';

    let {
        currentPhaseName,
        currentPhaseRange,
        hasCurrentPhase,
        hasState,
        capabilities,
        unmet,
        message,
        saved = false,
    }: {
        currentPhaseName: string;
        /** Pre-formatted dates, or empty when the phase has none. */
        currentPhaseRange: string;
        hasCurrentPhase: boolean;
        /** False when the hackathon has no HackathonState row to configure. */
        hasState: boolean;
        capabilities: { value: number; enabled: boolean }[];
        /** Capabilities the current phase expects that are switched off. */
        unmet: number[];
        /** Failure text from the last action, if it failed. */
        message?: string;
        saved?: boolean;
    } = $props();

    // "Vote and View results" / "Vote, View results and Register" — read out in
    // the warning, so it has to be prose rather than a chip list.
    const unmetNames = $derived(
        unmet.map((c) => capabilityLabel(c) ?? 'Unknown').map((s) => s.toLowerCase())
    );
    const unmetSentence = $derived(
        unmetNames.length <= 1
            ? (unmetNames[0] ?? '')
            : `${unmetNames.slice(0, -1).join(', ')} and ${unmetNames.at(-1)}`
    );
</script>

<section
    class="flex flex-col gap-4 border border-surface-200-800 bg-surface-100-900 px-5 py-4"
    aria-labelledby="right-now-heading"
>
    <div class="flex flex-col gap-0.5">
        <h3
            id="right-now-heading"
            class="m-0 text-[0.625rem] font-bold uppercase tracking-wide text-surface-500"
        >
            Right now
        </h3>
        {#if hasCurrentPhase}
            <div class="flex flex-wrap items-baseline gap-2">
                <span class="text-sm font-bold text-surface-950-50">{currentPhaseName}</span>
                {#if currentPhaseRange}
                    <span class="text-xs text-surface-500">{currentPhaseRange}</span>
                {/if}
                <!-- Clearing is a write, so a form. Omitting phaseId is what the
                     action reads as "clear". -->
                <form method="POST" action="?/setCurrent" class="ml-auto">
                    <button type="submit" class="btn btn-sm preset-tonal-surface text-xs">
                        Clear current phase
                    </button>
                </form>
            </div>
        {:else}
            <span class="text-sm font-bold text-surface-950-50">No current phase</span>
            <span class="text-xs text-surface-500">
                The timeline works out progress from the dates. Pick a phase below to say
                where you are instead.
            </span>
        {/if}
    </div>

    {#if message}
        <p class="m-0 text-xs text-error-500" role="alert">{message}</p>
    {:else if saved}
        <p class="m-0 text-xs text-success-700-300" role="status">Saved.</p>
    {/if}

    {#if hasState}
        <!-- The gap between what a phase is for and what is actually switched on.
             Nothing closes it automatically — that is the deliberate design — so
             this names it and offers the one click. -->
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

        <form method="POST" action="?/saveCapabilities" class="flex flex-col gap-3">
            <fieldset class="m-0 flex flex-col gap-2 border-0 p-0">
                <legend class="p-0 text-xs font-semibold text-surface-950-50">
                    What participants can do
                </legend>
                <!-- "Participants", never "you": capabilities grant to the Member
                     role and casbin has no inheritance, so an owner holds none of
                     them and is refused the very actions they switch on here. -->
                <p class="m-0 text-xs text-surface-500">
                    Moving between phases never changes these — they are always explicit.
                </p>
                <div class="grid gap-2 pt-1 sm:grid-cols-2">
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
            <button type="submit" class="btn btn-sm w-fit preset-filled-primary-500">
                Save changes
            </button>
        </form>
    {:else}
        <p class="m-0 text-xs text-surface-600-400">
            This hackathon has no configuration record, so what participants may do cannot
            be changed here. That is a data problem rather than a setting — every
            hackathon created through the app has one.
        </p>
    {/if}
</section>
