<script lang="ts">
    import { page as pageStore } from '$app/stores';
    import { resolve } from '$app/paths';
    import Select from '$lib/components/forms/Select.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();
    const pages = $derived(data.pages);
    const slug = $derived($pageStore.params.slug);
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/owner/hackathon/${slug}/timeline`)}
            class="w-fit text-xs font-semibold text-primary-700-300 no-underline hover:underline"
        >
            &larr; Back to Timeline
        </a>
        <h2 class="m-0 text-lg font-bold text-surface-950-50">New Phase</h2>
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
            Description
            <textarea
                name="description"
                required
                minlength="1"
                rows="3"
                class="border border-surface-200-800 bg-surface-50-950 px-3 py-2 text-sm
                       text-surface-950-50 focus:border-primary-500 focus:outline-none"
            ></textarea>
            <span class="font-normal text-[10px] text-surface-500">
                Short plain-text summary shown next to the phase. Long-form content belongs on the
                linked page.
            </span>
        </label>
        <label class="flex flex-col gap-1 text-xs font-semibold text-surface-500">
            Linked page (optional)
            <Select
                name="pageId"
                placeholder="None"
                options={[{ label: 'None', value: '' }, ...pages.map((p) => ({ label: p.title, value: p.id }))]}
            />
        </label>
        <button type="submit" class="btn btn-sm preset-filled-primary-500 self-start">
            Create Phase
        </button>
    </form>
</div>
