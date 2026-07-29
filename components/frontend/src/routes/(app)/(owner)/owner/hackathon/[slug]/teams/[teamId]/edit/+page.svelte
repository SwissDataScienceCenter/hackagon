<script lang="ts">
    import { page as pageStore } from '$app/stores';
    import { resolve } from '$app/paths';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();
    const team = $derived(data.team);
    const slug = $derived($pageStore.params.slug);
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/owner/hackathon/${slug}/teams`)}
            class="w-fit text-xs font-semibold text-primary-700-300 no-underline hover:underline"
        >
            &larr; Back to Teams
        </a>
        <h2 class="m-0 text-lg font-bold text-surface-950-50">Edit Team</h2>
    </div>

    <form
        method="POST"
        action="?/edit"
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
                value={team.name}
                class="h-9 border border-surface-200-800 bg-surface-50-950 px-3 text-sm
                       text-surface-950-50 focus:border-primary-500 focus:outline-none"
            />
        </label>
        <label class="flex flex-col gap-1 text-xs font-semibold text-surface-500">
            Description
            <MarkdownEditor name="description" value={team.description ?? ''} maxlength={10000} rows={10} />
        </label>
        <button type="submit" class="btn btn-sm preset-filled-primary-500 self-start">
            Save changes
        </button>
    </form>

    <form method="POST" action="?/delete" class="self-start">
        <button type="submit" class="btn btn-sm preset-tonal-surface">Delete Team</button>
    </form>
</div>
