<script lang="ts">
    import { Plus } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import ManageHubBackLink from '$lib/components/hackathon/ManageHubBackLink.svelte';
    import ProjectCard from '$lib/components/hackathon/ProjectCard.svelte';
    import ProjectStatusTabs from '$lib/components/hackathon/ProjectStatusTabs.svelte';
    import { projectStatusLabel, projectStatusBadgeVariant } from '$lib/utils/projectStatus';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const pageSize = 8;
    let page = $state(1);

    const pageCount = $derived(Math.max(1, Math.ceil(data.projects.length / pageSize)));
    const pagedProjects = $derived(
        data.projects.slice((page - 1) * pageSize, page * pageSize)
    );

    // Back to the first page whenever the tab changes. Clicking a tab is a
    // navigation, but this component stays mounted across it, so page 3 of the
    // approved list would otherwise carry over to a rejected list with one row
    // and show nothing at all.
    //
    // Compared against the previous value rather than just reading it: the
    // comparison is what subscribes this to a tab change, and a plain `let` holds
    // it because nothing renders it.
    let shownFilter = data.filter;
    $effect(() => {
        if (data.filter !== shownFilter) {
            shownFilter = data.filter;
            page = 1;
        }
    });

    $effect(() => {
        if (page > pageCount) page = pageCount;
    });
</script>

<!--
  Every project in the hackathon, one status at a time. The participant page lists
  the approved ones and offers a preference; deciding happens under Manage.
  Reached from the sidebar's Manage section (see $lib/navigation's manageNav).

  Always opens on Approved — the hackathon's line-up. The Awaiting review tab
  carries the count as a warning badge, which is how the queue asks to be looked
  at without deciding where anyone arrives.

  **Nothing is decided here.** Approve, Reject and returning a project to the
  queue all live on the project's own page, under the description they are a
  judgement of — the row offers "Review", which is the way there. What that costs
  is the one-click sweep down a long queue; what it buys is that nobody approves
  a proposal they have not opened.

  Rows still badge their status even inside a single-status tab: dropping the
  badge per tab would make the same row read differently depending on how you
  arrived. Approved carries no badge, as everywhere (see
  $lib/utils/projectStatus).

  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams).
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
            <ManageHubBackLink hackathonId={data.hackathonId} />
            <h2 class="m-0 text-title text-ink">Manage Projects</h2>
        </div>
        <!-- Unconditional, unlike the participant page's CTA: this is the
             organiser's create path, and it does not depend on whether
             participants may propose. -->
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/projects/manage/new`)}
            class="btn btn-solid w-full shrink-0 no-underline sm:w-auto sm:min-w-[9rem]"
        >
            <Plus class="h-3.5 w-3.5 shrink-0" />
            New Project
        </a>
    </div>

    <ProjectStatusTabs
        hackathonId={data.hackathonId}
        current={data.filter}
        counts={data.counts}
    />

    <div class="flex w-full flex-col items-stretch gap-2 self-start">
        {#if data.projects.length === 0}
            <!-- Says which list is empty. On a filtered tab "no projects have
                 been proposed yet" would be false as often as not — there may be
                 plenty, just none of this status. -->
            <p class="m-0 py-6 text-center text-sm text-ink-3">
                {#if data.filter === 'proposed'}
                    Nothing is awaiting review.
                {:else if data.filter === 'approved'}
                    No projects have been approved yet.
                {:else}
                    No projects have been rejected.
                {/if}
            </p>
        {:else}
            {#each pagedProjects as project (project.id)}
                <ProjectCard
                    num={project.num}
                    title={project.title}
                    excerpt={project.excerpt}
                    creator={project.creator}
                    track={project.track}
                    imageUrl={project.imageUrl}
                    badge={projectStatusLabel(project.status)}
                    badgeVariant={projectStatusBadgeVariant(project.status) ??
                        'badge-neutral'}
                    moreInfoHref="/my/hackathon/{data.hackathonId}/projects/manage/{project.id}{data.filterQuery}"
                    moreInfoLabel="Review"
                >
                    {#snippet actions()}
                        <!-- The organiser's edit route for any project, theirs or
                             not: `ProjectService.Edit` falls back to a
                             hackathon-wide project:write check
                             (`project_service.go:479-484`), so this offers what
                             the backend already allows. Not a decision, which is
                             why it is still here and Approve is not. -->
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
