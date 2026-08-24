<script lang="ts">
    let {
        src,
        initials,
        alt = '',
    }: {
        /** Absent, empty, or unreachable — all three fall back to the initials. */
        src?: string;
        /** Up to two letters, drawn when there is no usable image. */
        initials: string;
        /** Decorative by default: the name is always beside it in the markup. */
        alt?: string;
    } = $props();

    // A URL that 404s, redirects to a web page, or is simply not an image would
    // otherwise leave the browser's broken-image glyph in the circle — which
    // looks like a bug in the app rather than a bad link. `image` is free text
    // the proposer types, so this is the ordinary case, not the edge one.
    //
    // Recorded as *which* src failed rather than a boolean, so a new src is tried
    // afresh: a component reused across rows (or an image corrected by an edit)
    // must not stay failed because an earlier URL was.
    let failedSrc: string | undefined = $state(undefined);
    const usable = $derived(src !== undefined && src !== '' && failedSrc !== src);
</script>

<!--
  The round media the project, participant and team surfaces share: size-16, a
  2px ring, an image when there is one and the initials when there is not.
-->
{#if usable}
    <div
        class="relative size-16 shrink-0 overflow-hidden rounded-full border-2
               border-line bg-raised"
    >
        <img
            {src}
            {alt}
            onerror={() => (failedSrc = src)}
            class="absolute inset-0 block h-full w-full object-cover object-center"
        />
    </div>
{:else}
    <div
        class="flex size-16 shrink-0 items-center justify-center rounded-full border-2
               border-line bg-overlay text-xs font-bold text-ink"
    >
        {initials}
    </div>
{/if}
