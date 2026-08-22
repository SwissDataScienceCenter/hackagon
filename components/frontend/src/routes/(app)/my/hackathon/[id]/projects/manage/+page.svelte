<script lang="ts">
    import { resolve } from '$app/paths';
    import ManageHubBackLink from '$lib/components/hackathon/ManageHubBackLink.svelte';
    import ProjectCard from '$lib/components/hackathon/ProjectCard.svelte';
    import { projectStatusLabel, projectStatusBadgeVariant } from '$lib/utils/projectStatus';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const countLabel = $derived(
        data.projects.length === 1 ? '1 project' : `${data.projects.length} projects`
    );

    const pageSize = 8;
    let page = $state(1);

    const pageCount = $derived(Math.max(1, Math.ceil(data.projects.length / pageSize)));
    const pagedProjects = $derived(
        data.projects.slice((page - 1) * pageSize, page * pageSize)
    );

    $effect(() => {
        if (page > pageCount) page = pageCount;
    });
</script>

<!--
  The review queue: every project at every status, proposals first. The
  participant page lists the approved ones and offers a preference; deciding
  happens only here. Reached from the sidebar's Manage section (see
  $lib/navigation's manageNav).

  The one list that mixes statuses, so the one that badges them — and only the
  rows awaiting review carry a badge (see $lib/utils/projectStatus). Clear the
  queue and the badges go with it, which is the honest reading: every row left
  is approved.

  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams).
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-1">
        <ManageHubBackLink hackathonId={data.hackathonId} />
        <h2 class="m-0 text-title text-ink">Manage Projects</h2>
        <span class="text-xs text-ink-3">
            {countLabel}{#if data.pendingCount > 0}
                &middot; {data.pendingCount} awaiting review{/if}
        </span>
    </div>

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {/if}

    <div class="flex w-full flex-col items-stretch gap-2 self-start">
        {#if data.projects.length === 0}
            <p class="m-0 py-6 text-center text-sm text-ink-3">
                No projects have been proposed yet.
            </p>
        {:else}
            {#each pagedProjects as project (project.id)}
                <ProjectCard
                    num={project.num}
                    title={project.title}
                    description={project.description}
                    creator={project.creator}
                    track={project.track}
                    imageUrl={project.imageUrl}
                    badge={projectStatusLabel(project.status)}
                    badgeVariant={projectStatusBadgeVariant(project.status) ??
                        'badge-neutral'}
                    moreInfoHref="/my/hackathon/{data.hackathonId}/projects/manage/{project.id}"
                >
                    {#snippet actions()}
                        <!-- The organiser's edit route for any project, theirs or
                             not: `ProjectService.Edit` falls back to a
                             hackathon-wide project:write check
                             (`project_service.go:479-484`), so this offers what
                             the backend already allows. Saving returns to the
                             project. -->
                        <a
                            href={resolve(
                                `/my/hackathon/${data.hackathonId}/projects/${project.id}/edit`
                            )}
                            class="btn btn-sm btn-ghost no-underline"
                        >
                            Edit
                        </a>
                        {#if project.isPending}
                            <form method="POST" action="?/approve">
                                <input type="hidden" name="projectId" value={project.id} />
                                <button type="submit" class="btn btn-sm btn-solid">
                                    Approve
                                </button>
                            </form>
                        {:else}
                            <!-- Not "Reject": Disapprove returns a project to the
                                 queue rather than turning it down. See the TODO in
                                 +page.server.ts. -->
                            <form method="POST" action="?/disapprove">
                                <input type="hidden" name="projectId" value={project.id} />
                                <button type="submit" class="btn btn-sm btn-warning">
                                    Revoke approval
                                </button>
                            </form>
                        {/if}
                    {/snippet}
                </ProjectCard>
            {/each}
        {/if}
    </div>

    {#if pageCount > 1}
        <nav
            class="flex w-full justify-center gap-1"
            aria-label="Pagination"
        >
            {#each Array.from({ length: pageCount }, (_, i) => i + 1) as p (p)}
                <button
                    type="button"
                    onclick={() => (page = p)}
                    class="btn btn-sm tnum h-8 w-8 p-0
                           {page === p ? 'btn-accent' : 'btn-quiet'}"
                    aria-label="Page {p}"
                    aria-current={page === p ? 'page' : undefined}
                >
                    {p}
                </button>
            {/each}
        </nav>
    {/if}
</div>
