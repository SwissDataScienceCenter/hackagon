<script lang="ts">
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    const page = $derived(data.page);
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="card preset-outlined-surface-200-800 flex w-full flex-col gap-4 p-5">
        <h2 class="m-0 text-lg font-bold text-surface-950-50">{page.title}</h2>
        <div class="text-sm leading-relaxed text-surface-700-300">
            <MarkdownContent content={page.content} />
        </div>
    </div>
</div>
