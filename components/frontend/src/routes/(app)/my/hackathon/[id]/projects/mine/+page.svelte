<script lang="ts">
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
  The viewer's own projects, at every status. Badged like the proposals group on
  Projects: a pending or rejected row carries its status, an approved one
  carries none ($lib/utils/projectStatus explains why).

  Edit beside More Info on every row: a proposer edits their project whatever
  its status, and a rejected row's page is where the organiser's reason is read.
  No pagination, for the same reason the proposals group on Projects has none —
  one person's own projects are few.

  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches projects).
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-1">
        <h2 class="m-0 text-title text-ink">My projects</h2>
        <span class="text-xs text-ink-3">{countLabel}</span>
    </div>

    <div class="flex w-full flex-col items-stretch gap-2 self-start">
        {#if data.projects.length === 0}
            <p class="m-0 py-6 text-center text-sm text-ink-3">
                You have not proposed a project in this hackathon.
            </p>
        {:else}
            {#each data.projects as project (project.id)}
                <ProjectCard
                    num={project.num}
                    title={project.title}
                    excerpt={project.excerpt}
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
