<script lang="ts">
    import { Pencil, Plus } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches the other member pages). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-0.5">
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

    {#if data.pages.length === 0}
        <p class="m-0 py-6 text-center text-sm text-surface-500">
            No pages yet. Add one to give participants something to read.
        </p>
    {:else}
        <ol class="m-0 flex list-none flex-col gap-2 p-0">
            {#each data.pages as page (page.id)}
                <li
                    class="box-border w-full border border-surface-200-800 bg-surface-100-900
                           px-5 py-4"
                >
                    <div class="flex flex-wrap items-center gap-2">
                        <h3 class="m-0 text-sm font-bold leading-snug text-surface-950-50">
                            {page.title}
                        </h3>
                        <span
                            class="badge text-xs {page.visible
                                ? 'preset-tonal-success'
                                : 'preset-tonal-surface'}"
                        >
                            {page.visible ? 'Visible' : 'Hidden'}
                        </span>
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
