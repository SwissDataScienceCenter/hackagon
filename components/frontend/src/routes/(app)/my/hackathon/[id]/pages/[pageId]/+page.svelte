<script lang="ts">
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches the other member pages). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-1">
        <h2 class="m-0 text-lg font-bold text-surface-950-50">{data.page.title}</h2>
    </div>

    <div
        class="box-border w-full border border-surface-200-800 bg-surface-100-900 px-5 py-4
               text-sm leading-relaxed text-surface-700-300"
    >
        {#if data.page.content.trim()}
            <MarkdownContent content={data.page.content} />
        {:else}
            <p class="m-0 text-sm text-surface-500">This page has no content yet.</p>
        {/if}
    </div>
</div>
