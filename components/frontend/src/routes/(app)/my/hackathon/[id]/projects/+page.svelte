<script lang="ts">
    import { Plus } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import ProjectCard from '$lib/components/hackathon/ProjectCard.svelte';
    import { projectStatusLabel, projectStatusBadgeVariant } from '$lib/utils/projectStatus';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const countLabel = $derived(
        data.projects.length === 1 ? '1 project' : `${data.projects.length} projects`
    );

    const proposalsLabel = $derived(
        data.proposals.length === 1 ? '1 proposal' : `${data.proposals.length} proposals`
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
  Every project surface a participant has, on one page: the approved projects
  with the one action a participant has on them — marking a preference — and,
  above them, this viewer's own proposals that have not become projects.
  Proposals had a page of its own and a sidebar entry; it is a stage of a
  project's life rather than a place, and a hackathon that does not use proposals
  now shows a plain list instead of an entry leading to an empty page.

  Deciding lives under Manage Projects (see $lib/navigation's manageNav), so the
  projects list reads the same whatever the viewer's role.

  No status badges on the projects below: they are approved by construction, and
  a badge repeated on every row would only repeat the heading. The proposals
  group does badge them, because it is the one place a participant sees two
  statuses side by side — a proposal still waiting, and one that was turned down.
  A rejected row is how its author learns the decision, and its page is where the
  organiser's reason is read.

  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams).
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
            <h2 class="m-0 text-title text-ink">Projects</h2>
            <span class="text-xs text-ink-3">{countLabel}</span>
        </div>
        <!-- Absent when the hackathon runs without proposals, for an organiser
             as much as for a member: this section reads the same for everyone,
             and an organiser adds a project from Manage Projects instead. -->
        {#if data.takesProposals}
            <a
                href={resolve(`/my/hackathon/${data.hackathonId}/projects/propose`)}
                class="btn btn-solid w-full shrink-0 no-underline sm:w-auto sm:min-w-[9rem]"
            >
                <Plus class="h-3.5 w-3.5 shrink-0" />
                Propose a Project
            </a>
        {/if}
    </div>

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {/if}

    <!-- Rendered only when the viewer has one, so the page carries no empty
         section for the many people who never propose anything. No pagination
         either: one person's own open proposals are few, and a member with
         enough of them to page through is not a case worth building for before
         it exists. -->
    {#if data.proposals.length > 0}
        <section class="flex w-full flex-col gap-2 self-start">
            <!-- "Your proposals", not "awaiting review": the group holds decided
                 rows now too, and a heading claiming they are all still pending
                 would contradict the Rejected badge on one of them. -->
            <h3 class="m-0 text-meta text-ink-3">
                Your proposals &middot; {proposalsLabel}
            </h3>
            {#each data.proposals as proposal (proposal.id)}
                <ProjectCard
                    num={proposal.num}
                    title={proposal.title}
                    excerpt={proposal.excerpt}
                    creator={proposal.creator}
                    track={proposal.track}
                    imageUrl={proposal.imageUrl}
                    badge={projectStatusLabel(proposal.status)}
                    badgeVariant={projectStatusBadgeVariant(proposal.status) ??
                        'badge-neutral'}
                    moreInfoHref={proposal.mayEdit
                        ? `/my/hackathon/${data.hackathonId}/projects/${proposal.id}/edit`
                        : `/my/hackathon/${data.hackathonId}/projects/${proposal.id}`}
                    moreInfoLabel={proposal.mayEdit ? 'Edit' : 'More Info'}
                />
            {/each}
        </section>
    {/if}

    <div class="flex w-full flex-col items-stretch gap-2 self-start">
        {#if data.projects.length === 0}
            <p class="m-0 py-6 text-center text-sm text-ink-3">
                No projects have been approved yet.
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
                    moreInfoHref="/my/hackathon/{data.hackathonId}/projects/{project.id}"
                >
                    {#snippet actions()}
                        <!-- No Edit here. These are approved, and an approved
                             project belongs to the hackathon: its owner edits it
                             from Manage Projects, and the proposer's own control
                             lives on the proposals group above, while the
                             proposal is still open. -->
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
