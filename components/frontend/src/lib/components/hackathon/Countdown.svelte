<script lang="ts">
    import { formatCountdown, type Boundary } from '$lib/utils/relativeTime';

    /** Below this, the line turns warning-coloured. Above it, time left is
     *  information rather than pressure, and colouring every countdown would
     *  spend the warning hue on a phase with four days to run. */
    const URGENT_MS = 6 * 60 * 60 * 1000;

    let { boundary }: { boundary: Boundary } = $props();

    // Null until mounted, deliberately. The server and the browser would format
    // two different "now"s — a request that took 400ms is already a different
    // minute — and hydration reports that as a text mismatch. Rendering nothing
    // on the server keeps the markup stable and costs one frame in the browser.
    let now = $state<Date | null>(null);

    $effect(() => {
        now = new Date();
        // A minute is the smallest unit `formatCountdown` prints, so anything
        // faster re-renders the card to say exactly the same thing.
        const id = setInterval(() => (now = new Date()), 30_000);
        return () => clearInterval(id);
    });

    const remaining = $derived(now ? boundary.target.getTime() - now.getTime() : null);
    const label = $derived(now ? formatCountdown(boundary.target, now) : null);
    const tone = $derived(
        remaining !== null && remaining < URGENT_MS ? 'text-warning-ink' : 'text-ink-2',
    );
</script>

<!--
  The one line on this page that says how much time is left. Every other date is
  absolute, which answers "when" but not "how long" — and how long is what a
  participant is actually deciding against.
-->
{#if label}
    <span class="tnum text-xs font-semibold {tone}">
        {boundary.verb} in {label}
    </span>
{/if}
