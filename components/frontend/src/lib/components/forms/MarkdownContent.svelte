<script lang="ts">
    import { renderMarkdown } from '$lib/utils/markdown';

    let { content }: { content: string } = $props();

    const html = $derived(renderMarkdown(content));
</script>

<!-- `.markdown-body` lives in the theme, not here: the editor's preview pane
     renders through this same component, and a copy of these rules scoped to
     one file is how a preview starts lying about the finished page. -->
<div class="markdown-body">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- html is sanitized in renderMarkdown -->
    {@html html}
</div>
