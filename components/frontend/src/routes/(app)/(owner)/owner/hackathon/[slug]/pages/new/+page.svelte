<script lang="ts">
    import { page } from '$app/stores';
    import { resolve } from '$app/paths';
    import { Segment } from '@skeletonlabs/skeleton-svelte';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
    import type { ActionData } from './$types';

    let { form }: { form: ActionData } = $props();
    const slug = $derived($page.params.slug);
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/owner/hackathon/${slug}/pages`)}
            class="w-fit text-xs font-semibold text-primary-700-300 no-underline hover:underline"
        >
            &larr; Back to Pages
        </a>
        <h2 class="m-0 text-lg font-bold text-surface-950-50">New Page</h2>
    </div>

    <form
        method="POST"
        action="?/create"
        class="card preset-outlined-surface-200-800 flex w-full flex-col gap-3 p-5"
    >
        {#if form?.message}
            <p class="m-0 text-xs text-error-500">{form.message}</p>
        {/if}
        <label class="flex flex-col gap-1 text-xs font-semibold text-surface-500">
            Title
            <input
                type="text"
                name="title"
                required
                minlength="1"
                maxlength="255"
                class="h-9 border border-surface-200-800 bg-surface-50-950 px-3 text-sm
                       text-surface-950-50 focus:border-primary-500 focus:outline-none"
            />
        </label>
        <div class="flex flex-col gap-1 text-xs font-semibold text-surface-500">
            Visibility
            <Segment name="visible" defaultValue="hidden">
                <Segment.Item value="visible">Visible</Segment.Item>
                <Segment.Item value="hidden">Hidden</Segment.Item>
            </Segment>
        </div>
        <label class="flex flex-col gap-1 text-xs font-semibold text-surface-500">
            Content
            <MarkdownEditor name="content" value="" maxlength={10000} rows={10} />
        </label>
        <button type="submit" class="btn btn-sm preset-filled-primary-500 self-start">
            Create Page
        </button>
    </form>
</div>
