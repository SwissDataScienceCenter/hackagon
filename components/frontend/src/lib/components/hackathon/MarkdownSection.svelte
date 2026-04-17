<script lang="ts">
    let { content }: { content: string } = $props();
</script>

<section class="px-20 py-12">
    <div class="markdown-content max-w-[860px]">
        {@html content}
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

    :global([data-mode="dark"]) .markdown-content :global(p),
    :global([data-mode="dark"]) .markdown-content :global(li) {
        color: var(--color-surface-100);
    }
    :global([data-mode="dark"]) .markdown-content :global(a) {
        color: var(--color-primary-500);
    }
</style>
