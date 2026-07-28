<script lang="ts">
    import ParticipationCard from '$lib/components/hackathon/ParticipationCard.svelte';
    import HackathonSidebar from '$lib/components/hackathon/HackathonSidebar.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const projects = $derived(data.hackathon.projects);
    const previewProposals = $derived(projects.slice(0, 2));
    const trackCounts = $derived(
        data.hackathon.tracks.map((t) => ({
            name: t.name,
            count: projects.filter((p) => p.trackId === t.id).length,
        }))
    );
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
                <span class="text-xs text-surface-500">{projects.length} proposals</span>
            </div>

            {#if trackCounts.length > 0}
                <div class="mb-4 flex gap-3">
                    {#each trackCounts as track (track.name)}
                        <div class="flex flex-1 flex-col gap-1 bg-primary-500/5 p-3 dark:bg-primary-950">
                            <span class="text-xs font-bold text-primary-700-300">{track.name.toUpperCase()}</span>
                            <span class="text-xs text-surface-500">{track.count} proposals</span>
                        </div>
                    {/each}
                </div>
            {/if}

            {#each previewProposals as proposal, i (proposal.id)}
                <div class="flex items-center gap-3 border-t border-surface-200-800 py-3">
                    {#if proposal.image}
                        <img src={proposal.image} alt="" class="h-12 w-12 shrink-0 rounded object-cover" />
                    {:else}
                        <div class="h-12 w-12 shrink-0 bg-surface-100-900"></div>
                    {/if}
                    <div class="flex flex-1 flex-col gap-0.5">
                        <span class="text-xs font-semibold">{i + 1}. {proposal.title}</span>
                        <span class="text-xs text-surface-500">{proposal.description}</span>
                    </div>
                    <a href="#" class="btn btn-sm preset-tonal-surface no-underline">More Info</a>
                </div>
            {/each}

            <a
                href="#proposals"
                class="mt-2 block text-center text-xs font-semibold text-primary-700-300 no-underline hover:underline"
            >
                View all {projects.length} proposals →
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
