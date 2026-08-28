<script lang="ts">
    import { capabilityDescription, capabilityLabel } from '$lib/utils/phase';

    let {
        hasState,
        capabilities,
        message,
        saved = false,
    }: {
        /** False when the hackathon has no HackathonState row to configure. */
        hasState: boolean;
        capabilities: { value: number; enabled: boolean }[];
        /** Failure text from the last action, if it failed. */
        message?: string;
        saved?: boolean;
    } = $props();
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
    {#if hasState}
        <form method="POST" action="?/saveCapabilities" class="flex flex-col gap-3">
            <fieldset class="m-0 flex flex-col gap-1 border-0 p-0">
                <legend class="p-0" id="capabilities-heading">
                    <span class="text-section">
                        What participants can do
                    </span>
                </legend>
                <!-- "Participants", never "you": capabilities grant to the Member
                     role and casbin has no inheritance, so an owner holds none of
                     them and is refused the very actions they switch on here. -->
                <p class="m-0 text-xs text-ink-3">
                    Each one is a permission held by every participant, for the whole
                    hackathon. Moving between phases never changes them.
                </p>
                <!-- A row per capability rather than a two-column grid of bare
                     labels: six terms with nothing beside them read as settings,
                     when what is being decided is what everyone here may do.
                     Still no per-capability link to the screen that handles the
                     consequences — the Manage tiles below reach all of them, and
                     a second copy beside every switch was a wall of arrows. -->
                <div class="flex flex-col gap-1 pt-2">
                    {#each capabilities as capability (capability.value)}
                        <label
                            class="flex cursor-pointer items-start gap-2.5 rounded-field px-2 py-2
                                   hover:bg-raised"
                        >
                            <input
                                type="checkbox"
                                name="capabilities"
                                value={capability.value}
                                checked={capability.enabled}
                                class="checkbox mt-0.5"
                            />
                            <span class="flex min-w-0 flex-col gap-0.5">
                                <span class="text-xs font-semibold text-ink">
                                    {capabilityLabel(capability.value) ?? 'Unknown'}
                                </span>
                                <span class="text-xs text-ink-3">
                                    {capabilityDescription(capability.value) ??
                                        'No description for this capability.'}
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

            <!-- Ticking boxes and then pressing a phase button below discards the
                 ticks: these are separate forms, and the phase POST re-renders the
                 checkboxes from server state. Considered and accepted — the two
                 areas are visually distinct, and guarding it would need client
                 state for a small win. -->
            <!-- Outline, not solid: the solid button on this page moves the phase
                 marker, and two of them would read as equal footing. -->
            <button type="submit" class="btn btn-sm w-fit btn-outline-accent">
                Save changes
            </button>
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
