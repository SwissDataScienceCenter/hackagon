<script lang="ts">
    import { marked } from 'marked';
    import DOMPurify from 'isomorphic-dompurify';

    let { content }: { content: string } = $props();

    const html = $derived(DOMPurify.sanitize(marked(content, { async: false })));
</script>

<div class="markdown-content">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- html is DOMPurify-sanitized above -->
    {@html html}
</div>

<style>
    /* Author-written prose, so it takes the sans face. Headings inside keep the
       mono display voice via the base layer. */
    .markdown-content {
        font-family: var(--font-sans);
    }
    .markdown-content :global(h1),
    .markdown-content :global(h2),
    .markdown-content :global(h3) {
        font-weight: 700;
        margin: 0.6em 0 0.3em;
    }
    .markdown-content :global(p) {
        margin: 0 0 0.6em;
    }
    .markdown-content :global(ul),
    .markdown-content :global(ol) {
        margin: 0 0 0.6em;
        padding-left: 1.25em;
    }
    .markdown-content :global(code) {
        background: var(--color-raised);
        padding: 0.1em 0.3em;
        font-size: 0.9em;
    }
    .markdown-content :global(pre) {
        background: var(--color-raised);
        padding: 0.6em;
        overflow-x: auto;
    }
    .markdown-content :global(blockquote) {
        border-left: 2px solid var(--color-line);
        margin: 0 0 0.6em;
        padding-left: 0.75em;
        color: var(--color-ink-3);
    }
    .markdown-content :global(a) {
        color: var(--color-accent-ink);
    }
    .markdown-content :global(:first-child) {
        margin-top: 0;
    }
    .markdown-content :global(:last-child) {
        margin-bottom: 0;
    }
</style>
