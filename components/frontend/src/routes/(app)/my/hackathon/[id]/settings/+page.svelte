<script lang="ts">
    import { resolve } from '$app/paths';
    import { capabilityLabel } from '$lib/utils/phase';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // What each capability actually unlocks, in participant terms. Kept here
    // rather than in the shared helper: `capabilityLabel` names a capability
    // wherever it appears, including as a phase tag, while these sentences only
    // make sense next to a switch.
    const CAPABILITY_HELP: Partial<Record<number, string>> = {
        1: 'Anyone can join the hackathon. Turn off once the doors close.',
        2: 'Members can put forward new project ideas for approval.',
        3: 'Members can mark which projects they would like to work on.',
        4: 'Teams can submit their work against a project.',
        5: 'Members can vote. No voting UI exists yet, so this has no visible effect.',
        6: 'Members can see results once judging is done.',
    };
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/timeline`)}
            class="w-fit text-xs font-semibold text-primary-700-300 no-underline hover:underline"
        >
            &larr; Back to timeline
        </a>
        <h2 class="m-0 text-lg font-bold text-surface-950-50">Settings</h2>
        <p class="m-0 text-xs text-surface-500">
            What participants are allowed to do in {data.hackathonName}. These take effect
            immediately.
        </p>
    </div>

    {#if !data.hasState}
        <p class="m-0 border border-error-500/40 bg-error-500/10 px-4 py-3 text-xs text-surface-600-400">
            This hackathon has no configuration record, so its capabilities cannot be
            changed. That is a data problem rather than a setting — every hackathon
            created through the app has one.
        </p>
    {:else}
        <!-- Deliberately not phase-driven: moving to a phase changes nothing here.
             Enabling a capability stays an explicit decision, and the timeline warns
             when the current phase expects something that is off. -->
        <form method="POST" action="?/save" class="flex flex-col gap-6">
            {#if form?.message}
                <p class="m-0 text-xs text-error-500" role="alert">{form.message}</p>
            {:else if form?.saved}
                <p class="m-0 text-xs text-success-700-300" role="status">Settings saved.</p>
            {/if}

            <ul class="m-0 flex list-none flex-col gap-0 p-0">
                {#each data.capabilities as capability (capability.value)}
                    <li
                        class="box-border border border-surface-200-800 bg-surface-100-900 px-5 py-4
                               not-first:border-t-0"
                    >
                        <label class="flex cursor-pointer items-start gap-3">
                            <input
                                type="checkbox"
                                name="capabilities"
                                value={capability.value}
                                checked={capability.enabled}
                                class="checkbox mt-0.5 shrink-0"
                            />
                            <span class="flex min-w-0 flex-col gap-0.5">
                                <span class="text-sm font-bold text-surface-950-50">
                                    {capabilityLabel(capability.value) ?? 'Unknown'}
                                </span>
                                <span class="text-xs text-surface-600-400">
                                    {CAPABILITY_HELP[capability.value] ?? ''}
                                </span>
                            </span>
                        </label>
                    </li>
                {/each}
            </ul>

            <div class="flex gap-2">
                <button type="submit" class="btn btn-sm preset-filled-primary-500">
                    Save settings
                </button>
                <a
                    href={resolve(`/my/hackathon/${data.hackathonId}/timeline`)}
                    class="btn btn-sm preset-tonal-surface no-underline"
                >
                    Cancel
                </a>
            </div>
        </form>
    {/if}
</div>
