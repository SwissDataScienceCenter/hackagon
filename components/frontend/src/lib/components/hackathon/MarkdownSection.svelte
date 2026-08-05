<script lang="ts">
    import DOMPurify from 'isomorphic-dompurify';

    let { content }: { content: string } = $props();

    // HTML in, HTML out — deliberately not run through `marked`. The one caller
    // passes an indented HTML literal, which markdown would read as a code
    // block. For user-written markdown use MarkdownContent instead; this stays
    // sanitized so a description reaching it cannot smuggle in a script.
    const html = $derived(DOMPurify.sanitize(content));
</script>

<section class="px-4 py-12 sm:px-10 md:px-20">
    <div class="markdown-content max-w-4xl">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- html is DOMPurify-sanitized above -->
        {@html html}
    </div>
</section>

<style>
    .markdown-content :global(h2) {
        font-size: 1.25rem;
        font-weight: 700;
        margin-bottom: 1rem;
    }
    .markdown-content :global(h3) {
        font-size: 1rem;
        font-weight: 700;
        margin-top: 1.5rem;
        margin-bottom: 0.5rem;
    }
    .markdown-content :global(p) {
        font-size: 0.875rem;
        line-height: 1.625;
        color: var(--color-ink-2);
        margin-bottom: 0.75rem;
    }
    .markdown-content :global(ul) {
        list-style-type: disc;
        padding-left: 1.25rem;
        margin-bottom: 0.75rem;
    }
    .markdown-content :global(li) {
        font-size: 0.875rem;
        color: var(--color-ink-2);
        margin-bottom: 0.25rem;
    }
    .markdown-content :global(a) {
        color: var(--color-accent-ink);
        text-decoration: none;
    }
    .markdown-content :global(a:hover) {
        text-decoration: underline;
    }
    .markdown-content :global(strong) {
        font-weight: 600;
    }

    /* The two `[data-mode="dark"]` overrides that used to live here are gone:
       `ink-2` and `accent-ink` already flip with the mode, so restating them
       per-mode is exactly the hand-rolled swap the token layer exists to avoid. */
</style>
