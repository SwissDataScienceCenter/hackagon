<script lang="ts">
    import { page as pageStore } from '$app/stores';
    import { resolve } from '$app/paths';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
    import Select from '$lib/components/forms/Select.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();
    const phase = $derived(data.phase);
    const pages = $derived(data.pages);
    const slug = $derived($pageStore.params.slug);

    function toDateInputValue(d?: Date): string {
        if (!d) return '';
        const date = new Date(d);
        const offset = date.getTimezoneOffset();
        return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
    }
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/owner/hackathon/${slug}/phases`)}
            class="w-fit text-xs font-semibold text-primary-700-300 no-underline hover:underline"
        >
            &larr; Back to Phases
        </a>
        <h2 class="m-0 text-lg font-bold text-surface-950-50">Edit Phase</h2>
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
                value={phase.name}
                class="h-9 border border-surface-200-800 bg-surface-50-950 px-3 text-sm
                       text-surface-950-50 focus:border-primary-500 focus:outline-none"
            />
        </label>
        <div class="flex flex-col gap-4 sm:flex-row">
            <label class="flex flex-1 flex-col gap-1 text-xs font-semibold text-surface-500">
                Starts at (optional)
                <input
                    type="date"
                    name="startsAt"
                    value={toDateInputValue(phase.startsAt)}
                    class="h-9 border border-surface-200-800 bg-surface-50-950 px-3 text-sm
                           text-surface-950-50 focus:border-primary-500 focus:outline-none"
                />
            </label>
            <label class="flex flex-1 flex-col gap-1 text-xs font-semibold text-surface-500">
                Ends at (optional)
                <input
                    type="date"
                    name="endsAt"
                    value={toDateInputValue(phase.endsAt)}
                    class="h-9 border border-surface-200-800 bg-surface-50-950 px-3 text-sm
                           text-surface-950-50 focus:border-primary-500 focus:outline-none"
                />
            </label>
        </div>
        <label class="flex flex-col gap-1 text-xs font-semibold text-surface-500">
            Linked page (optional)
            <Select
                name="pageId"
                value={phase.pageId ?? ''}
                placeholder="None"
                options={[{ label: 'None', value: '' }, ...pages.map((p) => ({ label: p.title, value: p.id }))]}
            />
        </label>
        <label class="flex flex-col gap-1 text-xs font-semibold text-surface-500">
            Description
            <MarkdownEditor name="description" value={phase.description ?? ''} maxlength={10000} rows={10} />
        </label>
        <button type="submit" class="btn btn-sm preset-filled-primary-500 self-start">
            Save changes
        </button>
    </form>

    <form method="POST" action="?/delete" class="self-start">
        <button type="submit" class="btn btn-sm preset-tonal-surface">Delete Phase</button>
    </form>
</div>
