<script lang="ts">
    import { Plus, Search } from 'lucide-svelte';
    import TeamCard from '$lib/components/hackathon/TeamCard.svelte';

    interface TeamMember {
        name: string;
        imageUrl?: string;
    }

    interface Team {
        num: number;
        title: string;
        projectDescription: string;
        imageUrl?: string;
        members: TeamMember[];
        isOwn?: boolean;
    }

    const images = [
        '/images/hackathon-ord-2024/ambiance/ambiance_1.jpg',
        '/images/hackathon-ord-2024/teams/teams_1.jpg',
        '/images/hackathon-ord-2024/winners/winners_1.jpg',
        '/images/hackathon-ord-2024/ambiance/ambiance_3.jpg',
    ];

    const teams: Team[] = [
        {
            num: 13,
            title: 'Bishorn',
            projectDescription:
                'SoDeDo: A replicated, self-updating software-defined dataset for machine learning applications',
            imageUrl: images[0],
            isOwn: true,
            members: [
                { name: 'John\nAnderson' },
                { name: 'Juan' },
                { name: 'Viraj' },
            ],
        },
        {
            num: 14,
            title: 'Dufourspitze',
            projectDescription:
                'Embedding of Pharmacokinetic and Pharmacodynamic equations into symbolic representation and alignment with their textual description',
            imageUrl: images[1],
            members: [
                { name: 'Alex' },
                { name: 'Sam' },
            ],
        },
        {
            num: 12,
            title: 'Matterhorn',
            projectDescription:
                'A platform for semantic navigation and visualization of Neo4J graphs using natural language queries and knowledge graph exploration',
            imageUrl: images[2],
            members: [
                { name: 'Mina' },
                { name: 'Omar' },
                { name: 'Li' },
                { name: 'Eva' },
            ],
        },
        {
            num: 11,
            title: 'Rosenhorn',
            projectDescription:
                'RAG over institutional policy documents with grounded citations and role-based access control.',
            imageUrl: images[3],
            members: [{ name: 'Casey' }, { name: 'Rui' }],
        },
        {
            num: 10,
            title: 'Weisshorn',
            projectDescription:
                'Open Data Registry for Swiss Climate Data with semantic search and API discovery.',
            imageUrl: images[0],
            members: [{ name: 'Noah' }],
        },
        {
            num: 9,
            title: 'Dom',
            projectDescription: 'OGC API bridge for research geospatial collections and metadata harmonisation.',
            imageUrl: images[1],
            members: [{ name: 'Ivy' }, { name: 'Dan' }, { name: 'Mo' }],
        },
        {
            num: 8,
            title: 'Täschhorn',
            projectDescription:
                'Interactive data quality dashboard for open research datasets with real-time flagging.',
            imageUrl: images[2],
            members: [{ name: 'Pia' }, { name: 'Jan' }],
        },
        {
            num: 7,
            title: 'Zinalrothorn',
            projectDescription: 'ML model cards generator from research code and training configurations.',
            imageUrl: images[3],
            members: [{ name: 'Yuki' }, { name: 'Ben' }, { name: 'Zed' }, { name: 'Ann' }],
        },
        {
            num: 6,
            title: 'Ober Gabelhorn',
            projectDescription: 'Notebook-to-pipeline conversion with minimal manual refactoring for researchers.',
            imageUrl: images[0],
            members: [{ name: 'Leo' }, { name: 'Kai' }],
        },
    ];

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

<!--
  Aligned with participants/proposals: same shell; title + count left; Create Team + search right
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
            <h2 class="m-0 text-lg font-bold text-surface-950-50">Teams</h2>
            <span class="text-xs text-surface-500">{countLabel}</span>
        </div>
        <div
            class="flex w-full flex-col gap-2 sm:w-auto sm:min-w-0 sm:flex-row sm:items-center
                   sm:justify-end sm:gap-2"
        >
            <a
                href="#create-team"
                class="inline-flex h-9 w-full shrink-0 items-center justify-center gap-1.5
                       rounded-none px-3 text-center text-xs font-semibold no-underline
                       sm:w-auto sm:min-w-[7.5rem] preset-filled-primary-500"
            >
                <Plus class="h-3.5 w-3.5 shrink-0" />
                Create Team
            </a>
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
    </div>

    <div class="flex w-full flex-col items-stretch gap-3 self-start">
        {#if filtered.length === 0}
            <p class="m-0 py-6 text-center text-sm text-surface-500">
                No teams match your search.
            </p>
        {:else}
            {#each pagedTeams as team (team.num)}
                <TeamCard
                    num={team.num}
                    title={team.title}
                    projectDescription={team.projectDescription}
                    imageUrl={team.imageUrl}
                    members={team.members}
                    isOwn={team.isOwn}
                    moreInfoHref="#team-{team.num}"
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
