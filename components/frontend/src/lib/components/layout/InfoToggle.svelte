<script lang="ts">
    import type { Snippet } from 'svelte';
    import Info from 'lucide-svelte/icons/info';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import { HELP } from '$lib/content/help';

    let {
        label,
        topic,
        heading,
    }: {
        /** What the box explains, for the button's accessible name: "About platform roles". */
        label: string;
        /** Which help text to show: `$lib/content/help/<topic>.md`. */
        topic: string;
        /** The heading or control row the button sits beside. */
        heading: Snippet;
    } = $props();

    const id = $props.id();
    let open = $state(false);

    // help.test.ts makes a missing file a test failure; this only keeps a box
    // that slipped through from opening empty.
    const text = $derived(HELP[topic] ?? `_No help text for “${topic}” yet._`);
</script>

<!--
  An explanation kept off the page until asked for. The button sits beside what
  it explains, and the box opens directly below it, so the text is read next to
  the thing it is about instead of in a paragraph somewhere above.

  Inline rather than a floating popover: it pushes the content down instead of
  covering it, needs no positioning, and works the same on a phone.

  The wording lives in $lib/content/help, one Markdown file per topic, so it can
  be changed without touching the page that shows it.
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
            <MarkdownContent content={text} />
        </div>
    {/if}
</div>
