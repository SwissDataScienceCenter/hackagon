<script lang="ts">
    import { page } from '$app/state';
    import { pendingBack } from '$lib/navigation/backTrail.svelte';

    /**
     * "← Back to …": to the page the reader came from, and to the page's own
     * list when there is none to know of — a fresh tab, a bookmark, a reload,
     * or a form they just saved. See `$lib/navigation/backLink`.
     */
    let {
        fallbackHref,
        fallbackLabel,
    }: {
        /** Resolved, query included — where the link goes with nothing
            remembered. */
        fallbackHref: string;
        /** "Back to teams": what it says then. */
        fallbackLabel: string;
    } = $props();

    // This entry's own, once the layout has stored it; until then the one it
    // decided as the page was opening.
    const back = $derived(
        page.state.back ??
            (pendingBack.href === page.url.href ? pendingBack.back : undefined)
    );

    // A browser Back when the page to return to is the entry right before this
    // one: it lands where the reader had scrolled, and does not stack up a
    // trail of pages that only lead back and forth. A modified click is left
    // alone, so a new tab opens the address — the remembered page's.
    function onclick(e: MouseEvent) {
        if (!back?.adjacent) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        history.back();
    }
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- a path this app produced: the remembered page's own URL, or a fallback the caller resolved -->
<a
    href={back?.href ?? fallbackHref}
    {onclick}
    class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
>
    &larr; {back?.label ?? fallbackLabel}
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
