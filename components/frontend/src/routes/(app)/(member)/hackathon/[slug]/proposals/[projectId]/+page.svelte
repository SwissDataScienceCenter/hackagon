<script lang="ts">
    import { resolve } from '$app/paths';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import { projectStatusLabel, projectStatusBadgePreset } from '$lib/utils/projectStatus';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    const project = $derived(data.project);

    function formatDate(d: Date | undefined): string {
        if (!d) return '';
        return d.toLocaleDateString('en-CH', { day: 'numeric', month: 'short', year: 'numeric' });
    }
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <a
        href={resolve(`/hackathon/${data.slug}/proposals`)}
        class="w-fit text-xs font-semibold text-primary-700-300 no-underline hover:underline"
    >
        &larr; Back to proposals
    </a>

    <div class="card preset-outlined-surface-200-800 flex w-full flex-col gap-4 p-5">
        <div class="flex items-start gap-4">
            {#if project.image}
                <img
                    src={project.image}
                    alt=""
                    class="size-16 shrink-0 rounded-full border-2 border-surface-200-800 object-cover"
                />
            {:else}
                <div class="size-16 shrink-0 rounded-full border-2 border-surface-200-800 bg-surface-100-900"></div>
            {/if}
            <div class="flex min-w-0 flex-1 flex-col gap-1">
                <h2 class="m-0 text-lg font-bold text-surface-950-50">{project.title}</h2>
                <div class="flex flex-wrap items-center gap-2">
                    <span class="badge {projectStatusBadgePreset(project.status) ?? 'preset-tonal-surface'}">
                        {projectStatusLabel(project.status) ?? 'Unknown'}
                    </span>
                    {#if data.trackName}
                        <span class="badge preset-outlined-primary-500 text-xs font-semibold">
                            {data.trackName}
                        </span>
                    {/if}
                </div>
            </div>
        </div>

        <div class="text-sm leading-relaxed text-surface-700-300">
            <MarkdownContent content={project.description} />
        </div>

        <div class="flex flex-wrap gap-x-6 gap-y-1 border-t border-surface-200-800 pt-3 text-xs text-surface-500">
            <span>Proposed {formatDate(project.createdAt)}</span>
            {#if project.modifiedAt && project.modifiedAt.getTime() !== project.createdAt?.getTime()}
                <span>Last updated {formatDate(project.modifiedAt)}</span>
            {/if}
        </div>
    </div>
</div>
