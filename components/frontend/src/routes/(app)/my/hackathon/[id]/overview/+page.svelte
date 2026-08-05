<script lang="ts">
    import ParticipationCard from '$lib/components/hackathon/ParticipationCard.svelte';
    import HackathonSidebar from '$lib/components/hackathon/HackathonSidebar.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20 lg:flex-row lg:items-start">
    <div class="flex flex-1 flex-col gap-6">
        <ParticipationCard
            teamName="Bishorn"
            teamRole="Member"
            teamMemberCount={3}
            projectName="SoDeDo: Replicated Dataset for ML"
            projectTrack="Data Science"
            projectStatus="Proposal submitted"
            nextAction="Set Preferences"
            nextActionHref="#preferences"
            deadline="Closes in 12 days"
        />

        <!-- The registration form had no link anywhere in the UI: you could
             only reach it by knowing the URL, so answers were effectively
             write-once even after the backend allowed editing them. -->
        {#if data.hackathon.registrationForm}
            <div class="card preset-outlined-surface-200-800 flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                    <h2 class="text-base font-bold">Your registration answers</h2>
                    <p class="mt-1 text-sm text-surface-500">
                        Affiliation, skills, dietary needs and consents. You can change these
                        while the event runs.
                    </p>
                </div>
                <a
                    href="/register/{data.hackathon.id}"
                    class="btn btn-sm preset-tonal-surface no-underline"
                >
                    View or edit
                </a>
            </div>
        {/if}

        <div class="card preset-outlined-surface-200-800 p-5">
            <h2 class="mb-3 text-base font-bold">About</h2>
            {#if data.hackathon.description}
                <p class="text-sm leading-relaxed text-surface-700-300">{data.hackathon.description}</p>
            {:else}
                <p class="text-sm text-surface-500">No description provided.</p>
            {/if}
        </div>

        <div class="card preset-outlined-surface-200-800 p-5">
            <div class="mb-4 flex items-center justify-between">
                <h2 class="text-base font-bold">Project Proposals</h2>
                <span class="text-xs text-surface-500">16 proposals</span>
            </div>

            <div class="mb-4 flex gap-3">
                <div class="flex flex-1 flex-col gap-1 bg-primary-500/5 p-3 dark:bg-primary-950">
                    <span class="text-xs font-bold text-primary-700-300">DATA SCIENCE</span>
                    <span class="text-xs text-surface-500">9 proposals</span>
                </div>
                <div class="flex flex-1 flex-col gap-1 bg-secondary-500/5 p-3 dark:bg-secondary-950">
                    <span class="text-xs font-bold text-secondary-700-300">RESEARCH DATA INFRA</span>
                    <span class="text-xs text-surface-500">7 proposals</span>
                </div>
            </div>

            {#each [
                { num: 16, title: 'Embedding of Pharmacokinetic Equations', desc: 'In pharma and biotech, ODEs often follow repetitive patterns...' },
                { num: 15, title: 'Automatic extraction of data from literature', desc: 'Have you ever been frustrated by having to copy data...' },
            ] as proposal (proposal.num)}
                <div class="flex items-center gap-3 border-t border-surface-200-800 py-3">
                    <div class="h-12 w-12 shrink-0 bg-surface-100-900"></div>
                    <div class="flex flex-1 flex-col gap-0.5">
                        <span class="text-xs font-semibold">{proposal.num}. {proposal.title}</span>
                        <span class="text-xs text-surface-500">{proposal.desc}</span>
                    </div>
                    <a href="#" class="btn btn-sm preset-tonal-surface no-underline">More Info</a>
                </div>
            {/each}

            <a
                href="#proposals"
                class="mt-2 block text-center text-xs font-semibold text-primary-700-300 no-underline hover:underline"
            >
                View all 16 proposals →
            </a>
        </div>
    </div>

    <HackathonSidebar
        primaryAction="Set Preferences"
        primaryActionHref="#preferences"
        secondaryAction="Propose a Project"
        secondaryActionHref="#propose"
        deadline="Proposals close in 12 days"
        teamName="Bishorn"
        teamMemberCount={3}
        isAdmin={false}
    />
</div>
