<script lang="ts">
    import { resolve } from '$app/paths';
    import ProjectCard from '$lib/components/hackathon/ProjectCard.svelte';
    import { projectStatusLabel, projectStatusBadgeVariant } from '$lib/utils/projectStatus';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const countLabel = $derived(
        data.projects.length === 1 ? '1 project' : `${data.projects.length} projects`
    );

    // Only meaningful to a reviewer, who is the only viewer that sees proposals
    // at all — for everyone else the whole list is approved.
    const pendingCount = $derived(data.projects.filter((p) => p.isPending).length);

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
  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams).
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <!-- No propose CTA here: proposing belongs to Proposals, which is the page
         that then tracks what you put forward. One entry point, not two. -->
    <div class="flex min-w-0 flex-col gap-1">
        <h2 class="m-0 text-lg font-bold text-ink">All Projects</h2>
        <span class="text-xs text-ink-3">
            {countLabel}{#if data.mayReview && pendingCount > 0}
                &middot; {pendingCount} awaiting review{/if}
        </span>
    </div>

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {/if}

    <div class="flex w-full flex-col items-stretch gap-2 self-start">
        {#if data.projects.length === 0}
            <p class="m-0 py-6 text-center text-sm text-ink-3">
                {#if data.mayReview}
                    No projects have been proposed yet.
                {:else}
                    No projects have been approved yet.
                {/if}
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
                    moreInfoHref="/my/hackathon/{data.hackathonId}/projects/{project.id}"
                >
                    {#snippet actions()}
                        {#if project.mayEdit}
                            <!-- The project-side edit route, same as the project
                                 page's Edit: saving returns to the project. The
                                 proposals route is for rows on Proposals, which
                                 returns there instead. Offered per row: who may
                                 edit depends on who proposed it. -->
                            <a
                                href={resolve(
                                    `/my/hackathon/${data.hackathonId}/projects/${project.id}/edit`
                                )}
                                class="btn btn-sm btn-ghost no-underline"
                            >
                                Edit
                            </a>
                        {/if}
                        {#if data.mayReview}
                            {#if project.isPending}
                                <form method="POST" action="?/approve">
                                    <input type="hidden" name="projectId" value={project.id} />
                                    <button
                                        type="submit"
                                        class="btn btn-sm btn-solid"
                                    >
                                        Approve
                                    </button>
                                </form>
                            {:else}
                                <!-- Not "Reject": Disapprove returns a project to
                                     the queue rather than turning it down. See the
                                     TODO in +page.server.ts. -->
                                <form method="POST" action="?/disapprove">
                                    <input type="hidden" name="projectId" value={project.id} />
                                    <button type="submit" class="btn btn-sm btn-warning">
                                        Revoke approval
                                    </button>
                                </form>
                            {/if}
                        {/if}
                        {#if data.mayPrefer && !project.isPending}
                            {#if project.isPreferred}
                                <form method="POST" action="?/unprefer">
                                    <input type="hidden" name="projectId" value={project.id} />
                                    <button type="submit" class="btn btn-sm btn-success">
                                        &starf; Preferred
                                    </button>
                                </form>
                            {:else}
                                <form method="POST" action="?/prefer">
                                    <input type="hidden" name="projectId" value={project.id} />
                                    <button type="submit" class="btn btn-sm btn-accent">
                                        Prefer
                                    </button>
                                </form>
                            {/if}
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
                    class="btn btn-sm flex h-8 w-8 items-center justify-center p-0
                           text-xs font-semibold transition-colors
                           {page === p ? 'btn-solid' : 'btn-ghost'}"
                    aria-label="Page {p}"
                    aria-current={page === p ? 'page' : undefined}
                >
                    {p}
                </button>
            {/each}
        </nav>
    {/if}
</div>
