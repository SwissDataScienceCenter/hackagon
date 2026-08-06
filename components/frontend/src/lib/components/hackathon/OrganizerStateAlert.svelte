<script lang="ts">
    import { CircleAlert } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import type { StateAlert } from '$lib/utils/hackathonState';
    import { capabilityLabel } from '$lib/utils/phase';

    let {
        hackathonId,
        alerts,
    }: {
        hackathonId: string;
        /** From `stateAlerts`. Renders nothing when empty. */
        alerts: StateAlert[];
    } = $props();

    // "vote and view results" — read out inside a sentence, so prose rather than
    // a chip list. Same treatment CapabilitiesPanel gives the same list.
    function sentence(capabilities: number[]): string {
        const names = capabilities.map((c) => (capabilityLabel(c) ?? 'Unknown').toLowerCase());
        if (names.length <= 1) return names[0] ?? '';
        return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
    }
</script>

<!--
  Organiser-only, and rendered on every route in the hackathon rather than on the
  page that can fix it. That is the whole point: `SetCurrentPhase` moves the
  pointer and touches nothing else, so an organiser who declares "Judging"
  current and never opens Manage Timeline has no way of learning that voting is
  still switched off — participants find out for them, by being refused.

  Only the conditions that leave participants unable to act reach this bar; see
  `stateAlerts` for the two that were deliberately left off it. Full width and
  above the hero, so it is not mistaken for something belonging to one page.

  "Fix" goes to Manage Hackathon, which is where the capability switches live —
  not to Manage Timeline, which now only reports the mismatch on its phase rows,
  and not to the member overview, which is read-only for everyone.
-->
{#each alerts as alert (alert.kind)}
    <div
        class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-warning/40 bg-warning/10
               px-4 py-2 sm:px-10 md:px-20"
        role="status"
    >
        <CircleAlert class="h-4 w-4 shrink-0 text-warning-ink" aria-hidden="true" />
        {#if alert.kind === 'no-state'}
            <p class="m-0 text-xs text-ink-2">
                This hackathon has no configuration record, so participants cannot register,
                submit or vote. Every hackathon created through the app has one — this is a
                data problem rather than a setting.
            </p>
        {:else}
            <p class="m-0 text-xs text-ink-2">
                <strong class="font-semibold text-ink">{alert.phaseName}</strong>
                is the current phase, but
                <strong class="font-semibold text-ink">{sentence(alert.capabilities)}</strong>
                {alert.capabilities.length === 1 ? 'is' : 'are'} switched off — participants cannot
                do {alert.capabilities.length === 1 ? 'it' : 'them'}.
            </p>
            <a
                href={resolve(`/my/hackathon/${hackathonId}/manage`)}
                class="text-xs font-semibold text-warning-ink no-underline hover:underline"
            >
                Fix →
            </a>
        {/if}
    </div>
{/each}
