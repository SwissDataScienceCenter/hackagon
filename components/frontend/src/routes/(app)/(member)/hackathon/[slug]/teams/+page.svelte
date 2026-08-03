<script lang="ts">
    import { Search } from 'lucide-svelte';
    import TeamCard from '$lib/components/hackathon/TeamCard.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    const teams = $derived(data.teams);

    let search = $state('');

    const filtered = $derived(
        teams.filter(
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

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
            <h2 class="m-0 text-lg font-bold text-surface-950-50">Teams</h2>
            <span class="text-xs text-surface-500">{countLabel}</span>
        </div>
        <div class="relative w-full sm:w-72">
            <Search
                class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5
                       -translate-y-1/2 text-surface-400"
                aria-hidden="true"
            />
            <input
                type="search"
                bind:value={search}
                placeholder="Search teams by name, project…"
                class="h-9 w-full rounded-none border border-surface-200-800 bg-surface-50-950
                       pl-9 pr-3 text-xs text-surface-950-50 placeholder:text-surface-700-300
                       focus:border-primary-500 focus:outline-none"
            />
        </div>
    </div>

    <div class="flex w-full flex-col items-stretch gap-3 self-start">
        {#if filtered.length === 0}
            <p class="m-0 py-6 text-center text-sm text-surface-500">
                {teams.length === 0 ? 'No teams have been created yet.' : 'No teams match your search.'}
            </p>
        {:else}
            {#each pagedTeams as team (team.id)}
                <TeamCard
                    num={team.num}
                    title={team.title}
                    projectDescription={team.projectDescription}
                    members={team.members}
                    moreInfoHref="/hackathon/{data.slug}/teams/{team.id}"
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
                    class="btn btn-sm flex h-8 w-8 items-center justify-center rounded-none p-0
                           text-xs font-semibold transition-colors
                           {page === p ? 'preset-filled-primary-500' : 'preset-tonal-surface'}"
                    aria-label="Page {p}"
                    aria-current={page === p ? 'page' : undefined}
                >
                    {p}
                </button>
            {/each}
        </nav>
    {/if}
</div>
