<script lang="ts">
    import { CircleAlert } from 'lucide-svelte';
    import type { StateAlert } from '$lib/utils/hackathonState';

    let {
        alerts,
    }: {
        /** From `stateAlerts`. Renders nothing when empty. */
        alerts: StateAlert[];
    } = $props();
</script>

<!--
  Organiser-only, and rendered on every route in the hackathon rather than on one
  page, because what it reports is not about any page: a hackathon with no
  `HackathonState` row has nothing switched on and cannot have anything switched
  on, so every participant is stuck wherever they are.

  One kind of alert, and the bar for adding another is high — see `stateAlerts`
  for the three conditions kept off it, the "current phase plans a capability
  that is off" mismatch among them. An organiser switches capabilities on
  purpose; a banner that argues with a deliberate choice on every route is one
  people learn to stop reading, and it took the sidebar's attention badge with
  it.

  Full width and above the hero, so it is not mistaken for something belonging
  to one page.
-->
{#each alerts as alert (alert.kind)}
    <div
        class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-warning/40 bg-warning/10
               px-4 py-2 sm:px-10 md:px-20"
        role="status"
    >
        <CircleAlert class="h-4 w-4 shrink-0 text-warning-ink" aria-hidden="true" />
        <p class="m-0 text-xs text-ink-2">
            This hackathon has no configuration record, so participants cannot register, submit
            or vote. Every hackathon created through the app has one — this is a data problem
            rather than a setting.
        </p>
    </div>
{/each}
