<script lang="ts">
    import ParticipationCard from '$lib/components/hackathon/ParticipationCard.svelte';
    import HackathonSidebar from '$lib/components/hackathon/HackathonSidebar.svelte';
</script>

<div class="flex gap-6 px-20 py-6">
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

        <div class="card preset-outlined-surface-200-800 p-5">
            <h2 class="mb-3 text-base font-bold">About</h2>
            <p class="text-sm leading-relaxed text-surface-700 dark:text-surface-100">
                Explore the potential and impact of Open Research Data on the sciences!
                Co-organized by the Swiss Data Science Center and EPFL Open Science,
                this event brings together professionals from academia, industry, and the public sector.
            </p>
        </div>

        <div class="card preset-outlined-surface-200-800 p-5">
            <div class="mb-4 flex items-center justify-between">
                <h2 class="text-base font-bold">Project Proposals</h2>
                <span class="text-xs text-surface-500">16 proposals</span>
            </div>

            <div class="mb-4 flex gap-3">
                <div class="flex flex-1 flex-col gap-1 bg-primary-500/5 p-3 dark:bg-primary-950">
                    <span class="text-xs font-bold text-primary-700 dark:text-primary-500">DATA SCIENCE</span>
                    <span class="text-xs text-surface-500">9 proposals</span>
                </div>
                <div class="flex flex-1 flex-col gap-1 bg-secondary-500/5 p-3 dark:bg-secondary-950">
                    <span class="text-xs font-bold text-secondary-700 dark:text-secondary-500">RESEARCH DATA INFRA</span>
                    <span class="text-xs text-surface-500">7 proposals</span>
                </div>
            </div>

            {#each [
                { num: 16, title: 'Embedding of Pharmacokinetic Equations', desc: 'In pharma and biotech, ODEs often follow repetitive patterns...' },
                { num: 15, title: 'Automatic extraction of data from literature', desc: 'Have you ever been frustrated by having to copy data...' },
            ] as proposal (proposal.num)}
                <div class="flex items-center gap-3 border-t border-surface-200 py-3 dark:border-surface-800">
                    <div class="h-12 w-12 shrink-0 bg-surface-100 dark:bg-surface-800"></div>
                    <div class="flex flex-1 flex-col gap-0.5">
                        <span class="text-xs font-semibold">{proposal.num}. {proposal.title}</span>
                        <span class="text-xs text-surface-500">{proposal.desc}</span>
                    </div>
                    <a href="#" class="btn btn-sm preset-filled-primary-500 no-underline">More Info</a>
                </div>
            {/each}

            <a href="#proposals" class="mt-2 block text-center text-xs font-semibold text-primary-700 no-underline hover:underline dark:text-primary-500">
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
