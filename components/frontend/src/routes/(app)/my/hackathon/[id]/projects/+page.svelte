<script lang="ts">
    import { resolve } from '$app/paths';
    import ProjectCard from '$lib/components/hackathon/ProjectCard.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const countLabel = $derived(
        data.projects.length === 1
            ? '1 approved project'
            : `${data.projects.length} approved projects`
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
  The hackathon's approved projects, with the one action a participant has on
  them — marking a preference. Nothing else: proposals, the viewer's own at
  every status, and the Propose button live on My projects. A pending proposal
  is not a project yet, and a page that mixed the two had to explain the
  difference with a second group and badges.

  No Edit anywhere here: a proposer edits their projects from My projects, and
  the owner edits everyone's from Manage Projects. Deciding lives under Manage
  Projects too (see $lib/navigation's manageNav), so this list reads the same
  whatever the viewer's role.

  No status badges: every row is approved by construction, which the count line
  says once.

  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams).
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-1">
        <h2 class="m-0 text-title text-ink">Projects</h2>
        <span class="text-xs text-ink-3">
            {countLabel}
            <!-- Where a proposer's own rows went, said where they look for
                 them. Only when My projects is in the sidebar too. -->
            {#if data.showMineLink}
                &middot;
                <a
                    href={resolve(`/my/hackathon/${data.hackathonId}/projects/mine`)}
                    class="font-semibold text-accent-ink no-underline hover:underline"
                >
                    Your proposals are on My projects &rarr;
                </a>
            {/if}
        </span>
    </div>

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {/if}

    <div class="flex w-full flex-col items-stretch gap-2 self-start">
        {#if data.projects.length === 0}
            <p class="m-0 py-6 text-center text-sm text-ink-3">
                No projects have been approved yet.
            </p>
        {:else}
            {#each pagedProjects as project (project.id)}
                <ProjectCard
                    title={project.title}
                    excerpt={project.excerpt}
                    creator={project.creator}
                    track={project.track}
                    imageUrl={project.imageUrl}
                    moreInfoHref="/my/hackathon/{data.hackathonId}/projects/{project.id}"
                >
                    {#snippet actions()}
                        {#if data.mayPrefer}
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
