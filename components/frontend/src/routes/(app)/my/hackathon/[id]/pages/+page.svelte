<script lang="ts">
    import { enhance } from '$app/forms';
    import { resolve } from '$app/paths';
    import { ChevronDown, ChevronUp, Eye, EyeOff, Pencil, Plus } from 'lucide-svelte';
    import ManageHubBackLink from '$lib/components/hackathon/ManageHubBackLink.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches the other member pages). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-0.5">
            <ManageHubBackLink hackathonId={data.hackathonId} />
            <h2 class="m-0 text-lg font-bold text-surface-950-50">Manage Pages</h2>
            <span class="text-xs text-surface-500">
                {data.pages.length === 1 ? '1 page' : `${data.pages.length} pages`}
            </span>
        </div>
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/pages/new`)}
            class="btn btn-sm preset-filled-primary-500 no-underline"
        >
            <Plus class="h-3 w-3 shrink-0" aria-hidden="true" />
            New page
        </a>
    </div>

    <!-- A page picks up a phase badge once a phase links to it, but that link is
         set from the phase's own edit form, not here — this just points there. -->
    <p class="m-0 text-xs text-surface-500">
        Want a page tied to a phase? Link it from
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/timeline/manage`)}
            class="font-semibold text-primary-700-300 no-underline hover:underline"
        >
            that phase's edit form
        </a>
        on Manage Timeline.
    </p>

    {#if form?.message}
        <p class="m-0 text-sm text-error-700-300" role="alert">{form.message}</p>
    {/if}

    {#if data.pages.length === 0}
        <p class="m-0 py-6 text-center text-sm text-surface-500">
            No pages yet. Add one to give participants something to read.
        </p>
    {:else}
        <ol class="m-0 flex list-none flex-col gap-2 p-0">
            {#each data.pages as page, index (page.id)}
                <li
                    class="box-border w-full border border-surface-200-800 bg-surface-100-900
                           px-5 py-4"
                >
                    <div class="flex flex-wrap items-center gap-2">
                        <div class="flex shrink-0 flex-col">
                            <form method="POST" action="?/moveUp" use:enhance>
                                <input type="hidden" name="pageId" value={page.id} />
                                <button
                                    type="submit"
                                    disabled={index === 0}
                                    aria-label="Move {page.title} up"
                                    class="btn-icon btn-sm disabled:opacity-30"
                                >
                                    <ChevronUp class="h-3 w-3" aria-hidden="true" />
                                </button>
                            </form>
                            <form method="POST" action="?/moveDown" use:enhance>
                                <input type="hidden" name="pageId" value={page.id} />
                                <button
                                    type="submit"
                                    disabled={index === data.pages.length - 1}
                                    aria-label="Move {page.title} down"
                                    class="btn-icon btn-sm disabled:opacity-30"
                                >
                                    <ChevronDown class="h-3 w-3" aria-hidden="true" />
                                </button>
                            </form>
                        </div>
                        <h3 class="m-0 text-sm font-bold leading-snug text-surface-950-50">
                            {page.title}
                        </h3>
                        <form method="POST" action="?/toggleVisible" use:enhance>
                            <input type="hidden" name="pageId" value={page.id} />
                            <input type="hidden" name="visible" value={!page.visible} />
                            <button
                                type="submit"
                                aria-label={page.visible
                                    ? `Hide ${page.title}`
                                    : `Show ${page.title}`}
                                class="btn-icon btn-sm shrink-0"
                            >
                                {#if page.visible}
                                    <Eye class="h-4 w-4 text-success-700-300" aria-hidden="true" />
                                {:else}
                                    <EyeOff class="h-4 w-4 text-surface-500" aria-hidden="true" />
                                {/if}
                            </button>
                        </form>
                        {#if page.phaseName}
                            <span class="badge preset-tonal-primary text-xs">
                                {page.phaseName}
                            </span>
                        {/if}
                        <a
                            href={resolve(`/my/hackathon/${data.hackathonId}/pages/${page.id}/edit`)}
                            class="ml-auto text-xs font-semibold text-primary-700-300
                                   no-underline hover:underline"
                        >
                            <Pencil class="inline h-3 w-3 shrink-0" aria-hidden="true" />
                            Edit<span class="sr-only"> {page.title}</span>
                        </a>
                    </div>
                </li>
            {/each}
        </ol>
    {/if}
</div>
