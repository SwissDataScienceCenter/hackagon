<script lang="ts">
    import { Plus } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import ProjectCard from '$lib/components/hackathon/ProjectCard.svelte';
    import { projectStatusLabel, projectStatusBadgePreset } from '$lib/utils/projectStatus';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const countLabel = $derived(
        data.projects.length === 1 ? '1 proposal' : `${data.projects.length} proposals`
    );
</script>

<!--
  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches projects/participants/teams).
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
            <h2 class="m-0 text-lg font-bold text-surface-950-50">Proposals</h2>
            <span class="text-xs text-surface-500">{countLabel} awaiting review</span>
        </div>
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/projects/proposals/propose`)}
            class="inline-flex h-9 w-full shrink-0 items-center justify-center gap-1.5
                   rounded-none px-3 text-center text-xs font-semibold no-underline
                   sm:w-auto sm:min-w-[9rem] preset-filled-primary-500"
        >
            <Plus class="h-3.5 w-3.5 shrink-0" />
            Propose a Project
        </a>
    </div>

    <!-- No pagination: this list is one person's own proposals, and a member
         with enough of those to page through is not a case worth building for
         before it exists. -->
    <div class="flex w-full flex-col items-stretch gap-2 self-start">
        {#if data.projects.length === 0}
            <p class="m-0 py-6 text-center text-sm text-surface-500">
                {#if data.approvedCount > 0}
                    <!-- Approved proposals leave this page, so an author whose
                         proposals all landed would otherwise be told they had
                         never proposed anything. -->
                    Nothing awaiting review — all {data.approvedCount === 1
                        ? 'your proposal has'
                        : `${data.approvedCount} of your proposals have`} been approved.
                {:else}
                    You haven't proposed a project yet.
                {/if}
            </p>
        {:else}
            {#each data.projects as project (project.id)}
                <ProjectCard
                    num={project.num}
                    title={project.title}
                    description={project.description}
                    imageUrl={project.imageUrl}
                    badge={projectStatusLabel(project.status)}
                    badgePreset={projectStatusBadgePreset(project.status) ?? 'preset-tonal-surface'}
                    creator={project.creator}
                    track={project.track}
                    moreInfoHref="/my/hackathon/{data.hackathonId}/projects/proposals/{project.id}/edit"
                    moreInfoLabel="Edit"
                />
            {/each}
        {/if}
    </div>
</div>
