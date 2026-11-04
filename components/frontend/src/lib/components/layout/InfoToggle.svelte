<script lang="ts">
    import type { Snippet } from 'svelte';
    import Info from 'lucide-svelte/icons/info';

    let {
        label,
        heading,
        children,
    }: {
        /** What the box explains, for the button's accessible name: "About platform roles". */
        label: string;
        /** The heading or control row the button sits beside. */
        heading: Snippet;
        /** The explanation, shown only on demand. */
        children: Snippet;
    } = $props();

    const id = $props.id();
    let open = $state(false);
</script>

<!--
  An explanation kept off the page until asked for. The button sits beside what
  it explains, and the box opens directly below it, so the text is read next to
  the thing it is about instead of in a paragraph somewhere above.

  Inline rather than a floating popover: it pushes the content down instead of
  covering it, needs no positioning, and works the same on a phone.
-->
<div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center gap-2">
        {@render heading()}
        <button
            type="button"
            onclick={() => (open = !open)}
            aria-expanded={open}
            aria-controls={id}
            aria-label={label}
            title={label}
            class="btn btn-quiet btn-icon btn-sm {open ? 'text-info-ink' : 'text-ink-3'}"
        >
            <Info class="h-3.5 w-3.5" aria-hidden="true" />
        </button>
    </div>
    {#if open}
        <div
            {id}
            class="max-w-2xl rounded-card border border-info/40 bg-info/10 px-4 py-3
                   font-sans text-xs text-ink-2"
        >
            {@render children()}
        </div>
    {/if}
</div>
