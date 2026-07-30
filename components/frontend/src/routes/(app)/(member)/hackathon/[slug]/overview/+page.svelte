<script lang="ts">
    import { resolve } from '$app/paths';
    import ParticipationCard from '$lib/components/hackathon/ParticipationCard.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    const myTeam = $derived(data.myTeam);
    const approvedCount = $derived(data.approvedCount);
    const trackCounts = $derived(data.trackCounts);
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    {#if myTeam}
        <ParticipationCard
            teamName={myTeam.name}
            teamMemberCount={myTeam.memberCount}
            projectName={myTeam.projectName}
            projectTrack={myTeam.projectTrack}
            projectStatus={myTeam.projectStatus}
            nextAction="View Team"
            nextActionHref="/hackathon/{data.hackathon.id}/teams/{myTeam.id}"
        />
    {:else}
        <div class="card preset-outlined-surface-200-800 p-5">
            <h2 class="mb-2 text-base font-bold">Your Participation</h2>
            <p class="m-0 text-sm text-surface-500">
                You haven't been assigned to a team yet. Check the
                <a
                    href={resolve(`/hackathon/${data.hackathon.id}/teams`)}
                    class="text-primary-700-300 no-underline hover:underline"
                >
                    Teams
                </a>
                page once teams are formed.
            </p>
        </div>
    {/if}

    <div class="card preset-outlined-surface-200-800 p-5">
        <div class="mb-4 flex items-center justify-between">
            <h2 class="text-base font-bold">Projects</h2>
            <span class="text-xs text-surface-500">{approvedCount} approved</span>
        </div>

        {#if trackCounts.length > 0}
            <div class="mb-4 flex gap-3">
                {#each trackCounts as track (track.name)}
                    <div class="flex flex-1 flex-col gap-1 bg-primary-500/5 p-3 dark:bg-primary-950">
                        <span class="text-xs font-bold text-primary-700-300">{track.name.toUpperCase()}</span>
                        <span class="text-xs text-surface-500">{track.count} projects</span>
                    </div>
                {/each}
            </div>
        {/if}

        <a
            href={resolve(`/hackathon/${data.hackathon.id}/proposals`)}
            class="block text-center text-xs font-semibold text-primary-700-300 no-underline hover:underline"
        >
            View all {approvedCount} projects →
        </a>
    </div>
</div>
