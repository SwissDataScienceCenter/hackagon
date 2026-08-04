<script lang="ts">
    import { resolve } from '$app/paths';
    import ParticipationCard from '$lib/components/hackathon/ParticipationCard.svelte';
    import HackathonSidebar from '$lib/components/hackathon/HackathonSidebar.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const proposalCountLabel = $derived(
        data.approvedCount === 1 ? '1 proposal' : `${data.approvedCount} proposals`
    );

    // Two tones alternating, which is what the track boxes have always looked
    // like — except the count of tracks is now whatever the hackathon defines
    // rather than the two the placeholder hardcoded.
    function trackTone(i: number): { box: string; text: string } {
        return i % 2 === 0
            ? { box: 'bg-primary-500/5 dark:bg-primary-950', text: 'text-primary-700-300' }
            : { box: 'bg-secondary-500/5 dark:bg-secondary-950', text: 'text-secondary-700-300' };
    }
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20 lg:flex-row lg:items-start">
    <div class="flex flex-1 flex-col gap-6">
        {#if data.myTeam}
            <ParticipationCard
                membershipLabel={data.membershipLabel}
                teamName={data.myTeam.name}
                teamRole={data.myTeam.role}
                teamMemberCount={data.myTeam.memberCount}
                projectName={data.myTeam.projectName}
                projectTrack={data.myTeam.projectTrack}
                projectStatus={data.myTeam.projectStatus}
                nextAction="Set Preferences"
                nextActionHref="#preferences"
            />
        {:else}
            <div class="card preset-outlined-surface-200-800 p-5">
                <div class="mb-3 flex items-center justify-between">
                    <h2 class="text-base font-bold">Your Participation</h2>
                    <span class="badge preset-filled-primary-500 text-xs font-bold uppercase">
                        {data.membershipLabel}
                    </span>
                </div>
                <p class="text-sm text-surface-700-300">
                    You are not on a team yet.
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
                <span class="text-xs text-surface-500">{proposalCountLabel}</span>
            </div>

            {#if data.trackCounts.length > 0}
                <div class="mb-4 flex flex-wrap gap-3">
                    {#each data.trackCounts as track, i (track.id)}
                        {@const tone = trackTone(i)}
                        <div class="flex min-w-[8rem] flex-1 flex-col gap-1 p-3 {tone.box}">
                            <span class="text-xs font-bold uppercase {tone.text}">{track.name}</span>
                            <span class="text-xs text-surface-500">
                                {track.count === 1 ? '1 proposal' : `${track.count} proposals`}
                            </span>
                        </div>
                    {/each}
                </div>
            {/if}

            {#if data.previewProposals.length === 0}
                <p class="m-0 py-3 text-sm text-surface-500">
                    No proposals have been approved yet.
                </p>
            {:else}
                {#each data.previewProposals as proposal (proposal.id)}
                    <div class="flex items-center gap-3 border-t border-surface-200-800 py-3">
                        <div class="h-12 w-12 shrink-0 bg-surface-100-900"></div>
                        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span class="text-xs font-semibold">{proposal.num}. {proposal.title}</span>
                            <span class="truncate text-xs text-surface-500">{proposal.description}</span>
                        </div>
                        <a
                            href="#proposal-{proposal.id}"
                            class="btn btn-sm preset-tonal-surface no-underline"
                        >
                            More Info
                        </a>
                    </div>
                {/each}

                <!-- resolve() called inline: svelte/no-navigation-without-resolve
                     only recognizes it at the href, not via a $derived. -->
                <a
                    href={resolve(`/my/hackathon/${data.hackathon.id}/proposals`)}
                    class="mt-2 block text-center text-xs font-semibold text-primary-700-300 no-underline hover:underline"
                >
                    View all {proposalCountLabel} →
                </a>
            {/if}
        </div>
    </div>

    <HackathonSidebar
        primaryAction="Set Preferences"
        primaryActionHref="#preferences"
        secondaryAction="Propose a Project"
        secondaryActionHref="#propose"
        teamName={data.myTeam?.name}
        teamMemberCount={data.myTeam?.memberCount}
        isAdmin={false}
    />
</div>
