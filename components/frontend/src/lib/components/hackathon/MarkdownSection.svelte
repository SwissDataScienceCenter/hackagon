<script lang="ts">
    import { renderMarkdown } from '$lib/utils/markdown';

    /** Markdown source. May be untrusted (author-supplied, from the database). */
    let { content }: { content: string } = $props();

    const html = $derived(renderMarkdown(content));
</script>

<section class="px-4 py-12 sm:px-10 md:px-20">
    <div class="markdown-content max-w-4xl">
        <!--
            `html` is markdown parsed by marked and then filtered through the
            DOMPurify allowlist in $lib/utils/markdown — no scripts, no event
            handlers, no javascript:/data: URLs (audit F6). The lint rule cannot
            see through the helper call, so the disable stays.
        -->
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
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
        color: var(--color-surface-700);
        margin-bottom: 0.75rem;
    }
    .markdown-content :global(ul) {
        list-style-type: disc;
        padding-left: 1.25rem;
        margin-bottom: 0.75rem;
    }
    .markdown-content :global(li) {
        font-size: 0.875rem;
        color: var(--color-surface-700);
        margin-bottom: 0.25rem;
    }
    .markdown-content :global(a) {
        color: var(--color-primary-700);
        text-decoration: none;
    }
    .markdown-content :global(a:hover) {
        text-decoration: underline;
    }
    .markdown-content :global(strong) {
        font-weight: 600;
    }

    /* Real markdown can now produce these; without styling they render raw. */
    .markdown-content :global(h1) {
        font-size: 1.5rem;
        font-weight: 700;
        margin-bottom: 1rem;
    }
    .markdown-content :global(ol) {
        list-style-type: decimal;
        padding-left: 1.25rem;
        margin-bottom: 0.75rem;
    }
    .markdown-content :global(blockquote) {
        border-left: 3px solid var(--color-surface-300);
        padding-left: 1rem;
        margin-bottom: 0.75rem;
        font-style: italic;
    }
    .markdown-content :global(code) {
        font-family: ui-monospace, monospace;
        font-size: 0.8125rem;
    }
    .markdown-content :global(pre) {
        background-color: var(--color-surface-100);
        border-radius: 0.375rem;
        padding: 0.75rem 1rem;
        margin-bottom: 0.75rem;
        overflow-x: auto;
    }
    .markdown-content :global(hr) {
        border-top: 1px solid var(--color-surface-300);
        margin: 1.5rem 0;
    }
    .markdown-content :global(img),
    .markdown-content :global(iframe) {
        max-width: 100%;
    }
    .markdown-content :global(table) {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.875rem;
        margin-bottom: 0.75rem;
    }
    .markdown-content :global(th),
    .markdown-content :global(td) {
        border: 1px solid var(--color-surface-300);
        padding: 0.375rem 0.625rem;
        text-align: left;
    }
    .markdown-content :global(th) {
        font-weight: 600;
    }

    :global([data-mode="dark"]) .markdown-content :global(p),
    :global([data-mode="dark"]) .markdown-content :global(li) {
        color: var(--color-surface-100);
    }
    :global([data-mode="dark"]) .markdown-content :global(a) {
        color: var(--color-primary-500);
    }
    :global([data-mode="dark"]) .markdown-content :global(pre) {
        background-color: var(--color-surface-800);
    }
    :global([data-mode="dark"]) .markdown-content :global(blockquote),
    :global([data-mode="dark"]) .markdown-content :global(th),
    :global([data-mode="dark"]) .markdown-content :global(td),
    :global([data-mode="dark"]) .markdown-content :global(hr) {
        border-color: var(--color-surface-600);
    }
</style>
