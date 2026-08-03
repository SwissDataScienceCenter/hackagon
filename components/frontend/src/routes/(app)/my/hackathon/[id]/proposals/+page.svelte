<script lang="ts">
    import { Plus } from 'lucide-svelte';
    import ProposalCard from '$lib/components/hackathon/ProposalCard.svelte';

    interface Item {
        num: number;
        title: string;
        description: string;
        imageUrl?: string;
    }

    const images = [
        '/images/hackathon-ord-2024/ambiance/ambiance_1.jpg',
        '/images/hackathon-ord-2024/teams/teams_1.jpg',
        '/images/hackathon-ord-2024/winners/winners_1.jpg',
        '/images/hackathon-ord-2024/ambiance/ambiance_3.jpg',
    ];

    const proposals: Item[] = [
        { num: 16, title: 'Embedding of Pharmacokinetic and Pharmacodynamic equations', description: 'In pharma and biotech, ODEs (Ordinary Differential Equations) often follow repetitive patterns, and a copilot-like tool could streamline the equation-writing process and reduce errors.', imageUrl: images[0] },
        { num: 15, title: 'Automatic extraction of data from the literature', description: "Have you ever been frustrated by having to copy data from the supplementary files of the papers? But the data is distributed across multiple pdf pages or even worse it's embedded as an image!", imageUrl: images[1] },
        { num: 14, title: 'AgentSim: Browser-Based Agent Modeling with Real Trajectory Data', description: 'AgentSim is a browser-based application that leverages real-world trajectory data from the PNEUMA project to train agent-based models simulating urban traffic patterns.', imageUrl: images[2] },
        { num: 13, title: 'SoDeDo: A replicated, self-updating software-defined dataset', description: 'In this project we will explore the technologies for a proof-of-concept data store which simplifies collaborative dataset management for machine learning.', imageUrl: images[3] },
        { num: 12, title: 'A platform for semantic navigation and visualization of Neo4J graphs', description: 'Neo4J is a graph DB technology with powerful capabilities for graph data science and the exploration of massive knowledge graphs.', imageUrl: images[0] },
        { num: 11, title: 'ML Model Cards Generator for Research Code', description: 'Automatically generate standardised model cards from research code and training configs using LLMs.', imageUrl: images[1] },
        { num: 10, title: 'Open Data Registry for Swiss Climate Data', description: 'A discoverable registry linking climate datasets from Swiss research institutions with semantic search.', imageUrl: images[2] },
        { num: 9, title: 'Interactive Data Quality Dashboard', description: 'A web-based dashboard for exploring and flagging data quality issues in open research datasets in real time.', imageUrl: images[3] },
        { num: 8, title: 'Provenance Tracking for Data Pipelines', description: 'Lightweight middleware for tracking data lineage and provenance in research data pipelines using open standards.', imageUrl: images[0] },
        { num: 7, title: 'FAIR Metadata Schema for Genomics', description: 'Design and implement a community-driven metadata schema for genomics research data with automatic validation.', imageUrl: images[1] },
        { num: 6, title: 'Schema.org profiles for research datasets', description: 'Export and validate Schema.org Dataset markup for institutional repositories to improve findability.', imageUrl: images[2] },
        { num: 5, title: 'RAG over institutional policy documents', description: 'A retrieval system that answers questions about data-use policies and consent with grounded citations.', imageUrl: images[3] },
        { num: 4, title: 'Benchmark suite for tabular research data', description: 'Reproducible benchmarks and leaderboards for prediction tasks on curated open research tabular data.', imageUrl: images[0] },
        { num: 3, title: 'SoDeDo: Replicated Dataset for ML Benchmarks', description: 'A standardised, replicated dataset format for ML training and evaluation that supports FAIR principles.', imageUrl: images[1] },
        { num: 2, title: 'OGC API bridge for research geodata', description: 'Middleware exposing legacy research geospatial collections through OGC API Features and tiles.', imageUrl: images[2] },
        { num: 1, title: 'Notebook-to-pipeline conversion toolkit', description: 'Turn exploratory Jupyter notebooks into tested, schedulable pipelines with minimal manual refactoring.', imageUrl: images[3] },
    ];

    const pageSize = 8;
    let page = $state(1);

    const pageCount = Math.max(1, Math.ceil(proposals.length / pageSize));
    const pagedProposals = $derived(
        proposals.slice((page - 1) * pageSize, page * pageSize)
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
            href="#propose"
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
                moreInfoHref="#proposal-{proposal.num}"
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
