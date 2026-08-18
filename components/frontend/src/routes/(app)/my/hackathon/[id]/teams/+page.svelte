<script lang="ts">
    import { Search } from 'lucide-svelte';
    import TeamCard from '$lib/components/hackathon/TeamCard.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    let search = $state('');

    const filtered = $derived(
        data.teams.filter(
            (t) =>
                search.trim() === '' ||
                `${t.num} ${t.title} ${t.projectDescription}`
                    .toLowerCase()
                    .includes(search.trim().toLowerCase())
        )
    );

    const countLabel = $derived(
        filtered.length === 1 ? '1 team' : `${filtered.length} teams`
    );

    const pageSize = 8;
    let page = $state(1);

    const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
    const pagedTeams = $derived(
        filtered.slice((page - 1) * pageSize, page * pageSize)
    );

    $effect(() => {
        void search;
        page = 1;
    });

    $effect(() => {
        if (page > pageCount) page = pageCount;
    });
</script>

<!--
  Aligned with participants/projects: same shell; title + count left; search right.

  No Manage Teams control here: it is an organiser action and lives in the
  sidebar's Manage section (see $lib/navigation's manageNav), which is the one
  place an owner's extra capabilities are collected. Nor a Create Team one —
  teams are formed on the manage page, by assigning people to a project.
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
            <h2 class="m-0 text-title text-ink">Teams</h2>
            <span class="text-xs text-ink-3">{countLabel}</span>
        </div>
        <div
            class="flex w-full flex-col gap-2 sm:w-auto sm:min-w-0 sm:flex-row sm:items-center
                   sm:justify-end"
        >
            <div class="relative w-full sm:w-72">
                <Search
                    class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5
                           -translate-y-1/2 text-ink-3"
                    aria-hidden="true"
                />
                <input
                    type="search"
                    bind:value={search}
                    placeholder="Search teams by name, project…"
                    class="field pl-9 pr-3"
                />
            </div>
        </div>
    </div>

    <div class="flex w-full flex-col items-stretch gap-3 self-start">
        {#if data.teams.length === 0}
            <p class="m-0 py-6 text-center text-sm text-ink-3">
                No teams have been formed yet.
            </p>
        {:else if filtered.length === 0}
            <p class="m-0 py-6 text-center text-sm text-ink-3">
                No teams match your search.
            </p>
        {:else}
            {#each pagedTeams as team (team.id)}
                <!-- No moreInfoHref: teams have no detail page on this branch
                     (main's teams/[teamId] was not carried over), and the
                     placeholder "#team-{id}" this used to pass threw inside
                     TeamCard's resolve(). TeamCard hides the link without one. -->
                <TeamCard
                    num={team.num}
                    title={team.title}
                    projectDescription={team.projectDescription}
                    imageUrl={team.imageUrl}
                    members={team.members}
                    isOwn={team.isOwn}
                />
            {/each}
        {/if}
    </div>

    {#if pageCount > 1}
        <nav class="flex w-full justify-center gap-1" aria-label="Pagination">
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
