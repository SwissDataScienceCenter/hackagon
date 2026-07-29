<script lang="ts">
    import { resolve } from '$app/paths';
    import ParticipationCard from '$lib/components/hackathon/ParticipationCard.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    const myTeam = $derived(data.myTeam);

    const projects = $derived(data.hackathon.projects);
    const trackCounts = $derived(
        data.hackathon.tracks.map((t) => ({
            name: t.name,
            count: projects.filter((p) => p.trackId === t.id).length,
        }))
    );
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

        <a
            href={resolve(`/hackathon/${data.hackathon.id}/proposals`)}
            class="block text-center text-xs font-semibold text-primary-700-300 no-underline hover:underline"
        >
            View all {projects.length} proposals →
        </a>
    </div>
</div>
