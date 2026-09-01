<script lang="ts">
    import { usableImage } from '$lib/utils/imageUrl';

    let {
        src,
        alt = '',
        maxHeight = 'max-h-56',
        class: extra = '',
        onload,
        onerror,
    }: {
        src?: string;
        alt?: string;
        /**
         * The one dimension a caller gets to choose. A Tailwind `max-h-*` class
         * rather than a number, so it goes through the same scale as everything
         * else on the page.
         */
        maxHeight?: string;
        /**
         * Classes for the *wrapper*, which is where a width cap belongs. Putting
         * one on the image would collide with its own `max-w-full` — two
         * `max-width` utilities on one element, resolved by stylesheet order
         * rather than by intent, which is how a picture meant to stop at 48rem
         * ends up spanning the window.
         */
        class?: string;
        /** For a caller using the load itself as a check — see `ImageUrlField`. */
        onload?: () => void;
        onerror?: () => void;
    } = $props();

    // The shared rule for an address somebody typed: show nothing rather than
    // the browser's broken-image glyph, and record *which* address failed so a
    // corrected one is tried afresh.
    let failedSrc: string | undefined = $state(undefined);
    const usable = $derived(usableImage(src, failedSrc));
</script>

<!--
  A picture stored as a URL somebody typed — a hackathon's logo, a project's
  image — drawn the same way everywhere it appears, including in the form where
  the address is entered.

  There is one field per picture and no way to know what shape it holds.
  Organisers paste wide event banners, square wordmarks with transparent
  backgrounds, 16:9 photographs and the occasional portrait poster. Any fixed
  aspect box crops at least two of those badly with `cover`, or strands them in
  bars with `contain`. There is no ratio that serves all four.

  So no ratio is imposed. The image keeps its own proportions, bounded by the
  wrapper's width and one max-height, and the browser scales it down to fit both.
  A banner comes out wide and short, a wordmark square, a poster tall and narrow
  — each of them whole, none of them cropped, and the rule fits in a sentence
  somebody can predict from: *your picture, at most this tall, at most this
  wide.* That is also what makes the form's preview honest — it is this
  component, not an impression of it.

  The ground behind it is not decoration: a wordmark saved as a transparent PNG
  has to land on something, and on the bare canvas it would appear to float. The
  hairline gives a photograph an edge for the same reason.

  Not used for the row thumbnails in a list — those need a fixed square footprint
  to keep the rows aligned, which is a different problem. `HackathonRow` solves
  it with the same `object-contain` rule inside a fixed box.
-->
{#if usable}
    <div class={extra}>
        <img
            {src}
            {alt}
            onload={() => onload?.()}
            onerror={() => {
                failedSrc = src;
                onerror?.();
            }}
            class="block h-auto w-auto max-w-full rounded-card border border-line
                   bg-raised {maxHeight}"
        />
    </div>
{/if}
