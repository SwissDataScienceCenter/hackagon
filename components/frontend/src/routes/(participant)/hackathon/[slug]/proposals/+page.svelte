<script lang="ts">
    import { resolve } from '$app/paths';
    import { Plus } from 'lucide-svelte';
    import ProposalCard from '$lib/components/hackathon/ProposalCard.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    const proposals = $derived(data.proposals);
    const slug = $derived(data.slug);

    const pageSize = 8;
    let pageNum = $state(1);

    const pageCount = $derived(Math.max(1, Math.ceil(proposals.length / pageSize)));
    const pagedProposals = $derived(
        proposals.slice((pageNum - 1) * pageSize, pageNum * pageSize)
    );
</script>

<!--
  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams).
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
            <h2 class="m-0 text-lg font-bold text-surface-950-50">Proposals</h2>
            <span class="text-xs text-surface-500">{proposals.length} proposals</span>
        </div>
        <a
            href={resolve(`/hackathon/${slug}/proposals/create`)}
            class="inline-flex h-9 w-full shrink-0 items-center justify-center gap-1.5
                   rounded-none px-3 text-center text-xs font-semibold no-underline
                   sm:w-auto sm:min-w-[9rem] preset-filled-primary-500"
        >
            <Plus class="h-3.5 w-3.5 shrink-0" />
            Propose a Project
        </a>
    </div>

    <div class="flex w-full flex-col items-stretch gap-2 self-start">
        {#each pagedProposals as proposal (proposal.num)}
            <ProposalCard
                num={proposal.num}
                title={proposal.title}
                description={proposal.description}
                imageUrl={proposal.imageUrl}
                moreInfoHref="/hackathon/{slug}/proposals/{proposal.id}"
            />
        {/each}
    </div>

    {#if pageCount > 1}
        <nav
            class="flex w-full justify-center gap-1"
            aria-label="Pagination"
        >
            {#each Array.from({ length: pageCount }, (_, i) => i + 1) as p (p)}
                <button
                    type="button"
                    onclick={() => (pageNum = p)}
                    class="btn btn-sm flex h-8 w-8 items-center justify-center rounded-none p-0
                           text-xs font-semibold transition-colors
                           {pageNum === p ? 'preset-filled-primary-500' : 'preset-tonal-surface'}"
                    aria-label="Page {p}"
                    aria-current={pageNum === p ? 'page' : undefined}
                >
                    {p}
                </button>
            {/each}
        </nav>
    {/if}
</div>
