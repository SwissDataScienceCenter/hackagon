<script lang="ts">
    import { Plus } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import ProjectCard from '$lib/components/hackathon/ProjectCard.svelte';
    import { projectStatusLabel, projectStatusBadgeVariant } from '$lib/utils/projectStatus';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const countLabel = $derived(
        data.projects.length === 1 ? '1 project' : `${data.projects.length} projects`
    );
</script>

<!--
  The viewer's own projects, at every status — the only place a participant
  sees their pending and rejected proposals, since Projects lists approved ones
  alone. A pending or rejected row carries its status, an approved one carries
  none ($lib/utils/projectStatus explains why). A rejected row is how its author
  learns the decision, and its page is where the organiser's reason is read.

  Edit beside View on every row: a proposer edits their project whatever
  its status. No pagination — one person's own projects are few.

  The Propose button lives here, and only here: proposing is the viewer's own
  business, and Projects lists approved projects alone. In the header once
  there is a list to sit above; with nothing proposed yet it is the empty
  state itself. Absent while proposals are closed — an organiser adds a project
  from Manage Projects instead.

  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches projects).
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
            <h2 class="m-0 text-title text-ink">My projects</h2>
            <span class="text-xs text-ink-3">{countLabel}</span>
        </div>
        {#if data.proposalsOpen && data.projects.length > 0}
            <a
                href={resolve(`/my/hackathon/${data.hackathonId}/projects/propose`)}
                class="btn btn-solid w-full shrink-0 no-underline sm:w-auto sm:min-w-[9rem]"
            >
                <Plus class="h-3.5 w-3.5 shrink-0" />
                Propose a Project
            </a>
        {/if}
    </div>

    <div class="flex w-full flex-col items-stretch gap-2 self-start">
        {#if data.projects.length === 0}
            {#if data.proposalsOpen}
                <div class="flex flex-col items-center gap-3 py-6">
                    <p class="m-0 text-center text-sm text-ink-3">
                        You have not proposed a project yet.
                    </p>
                    <a
                        href={resolve(`/my/hackathon/${data.hackathonId}/projects/propose`)}
                        class="btn btn-solid no-underline"
                    >
                        <Plus class="h-3.5 w-3.5 shrink-0" />
                        Propose your first project
                    </a>
                </div>
            {:else}
                <p class="m-0 py-6 text-center text-sm text-ink-3">
                    You have not proposed a project in this hackathon.
                </p>
            {/if}
        {:else}
            {#each data.projects as project (project.id)}
                <ProjectCard
                    title={project.title}
                    excerpt={project.excerpt}
                    creator={project.creator}
                    track={project.track}
                    imageUrl={project.imageUrl}
                    badge={projectStatusLabel(project.status)}
                    badgeVariant={projectStatusBadgeVariant(project.status) ??
                        'badge-neutral'}
                    moreInfoHref="/my/hackathon/{data.hackathonId}/projects/{project.id}"
                >
                    {#snippet actions()}
                        <a
                            href={resolve(
                                `/my/hackathon/${data.hackathonId}/projects/${project.id}/edit`
                            )}
                            class="btn btn-sm btn-ghost no-underline"
                        >
                            Edit
                        </a>
                    {/snippet}
                </ProjectCard>
            {/each}
        {/if}
    </div>
</div>
