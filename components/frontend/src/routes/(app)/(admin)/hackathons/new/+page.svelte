<script lang="ts">
    import { resolve } from '$app/paths';
    import { Segment } from '@skeletonlabs/skeleton-svelte';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
    import type { ActionData } from './$types';

    let { form }: { form: ActionData } = $props();
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve('/(app)/(admin)/hackathons')}
            class="w-fit text-xs font-semibold text-primary-700-300 no-underline hover:underline"
        >
            &larr; Back to all hackathons
        </a>
        <h2 class="m-0 text-lg font-bold text-surface-950-50">Create Hackathon</h2>
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
            Name
            <input
                type="text"
                name="name"
                required
                minlength="3"
                maxlength="255"
                class="h-9 border border-surface-200-800 bg-surface-50-950 px-3 text-sm
                       text-surface-950-50 focus:border-primary-500 focus:outline-none"
            />
        </label>
        <div class="flex flex-col gap-1 text-xs font-semibold text-surface-500">
            Visibility
            <Segment name="visibility" defaultValue="public">
                <Segment.Item value="public">Public</Segment.Item>
                <Segment.Item value="private">Private</Segment.Item>
            </Segment>
        </div>
        <div class="flex flex-col gap-4 sm:flex-row">
            <label class="flex flex-1 flex-col gap-1 text-xs font-semibold text-surface-500">
                Starts at (optional)
                <input
                    type="date"
                    name="startsAt"
                    class="h-9 border border-surface-200-800 bg-surface-50-950 px-3 text-sm
                           text-surface-950-50 focus:border-primary-500 focus:outline-none"
                />
            </label>
            <label class="flex flex-1 flex-col gap-1 text-xs font-semibold text-surface-500">
                Ends at (optional)
                <input
                    type="date"
                    name="endsAt"
                    class="h-9 border border-surface-200-800 bg-surface-50-950 px-3 text-sm
                           text-surface-950-50 focus:border-primary-500 focus:outline-none"
                />
            </label>
        </div>
        <label class="flex flex-col gap-1 text-xs font-semibold text-surface-500">
            Logo URL (optional)
            <input
                type="url"
                name="logo"
                placeholder="https://…"
                class="h-9 border border-surface-200-800 bg-surface-50-950 px-3 text-sm
                       text-surface-950-50 focus:border-primary-500 focus:outline-none"
            />
        </label>
        <label class="flex flex-col gap-1 text-xs font-semibold text-surface-500">
            Description (optional)
            <MarkdownEditor name="description" maxlength={10000} rows={10} />
        </label>
        <button type="submit" class="btn btn-sm preset-filled-primary-500 self-start">
            Create hackathon
        </button>
    </form>
</div>
