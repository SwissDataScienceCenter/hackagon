<script lang="ts">
    import { resolve } from '$app/paths';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
    import TrackPicker from '$lib/components/hackathon/TrackPicker.svelte';
    import type { PageData, ActionData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();
    const tracks = $derived(data.tracks);
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/hackathon/${data.slug}/proposals`)}
            class="w-fit text-xs font-semibold text-primary-700-300 no-underline hover:underline"
        >
            &larr; Back to proposals
        </a>
        <h2 class="m-0 text-lg font-bold text-surface-950-50">Propose a Project</h2>
    </div>

    <form method="POST" action="?/propose" class="card preset-outlined-surface-200-800 flex w-full flex-col gap-3 p-5">
        {#if form?.message}
            <p class="m-0 text-xs text-error-500">{form.message}</p>
        {/if}
        <label class="flex flex-col gap-1 text-xs font-semibold text-surface-500">
            Title
            <input
                type="text"
                name="title"
                required
                minlength="3"
                maxlength="255"
                class="h-9 border border-surface-200-800 bg-surface-50-950 px-3 text-sm
                       text-surface-950-50 focus:border-primary-500 focus:outline-none"
            />
        </label>
        <label class="flex flex-col gap-1 text-xs font-semibold text-surface-500">
            Description
            <MarkdownEditor name="description" required maxlength={10000} rows={10} />
        </label>
        {#if tracks.length > 0}
            <div class="flex flex-col gap-1 text-xs font-semibold text-surface-500">
                Track (optional)
                <TrackPicker name="trackId" {tracks} />
            </div>
        {/if}
        <button type="submit" class="btn btn-sm preset-filled-primary-500 self-start">
            Submit proposal
        </button>
    </form>
</div>
