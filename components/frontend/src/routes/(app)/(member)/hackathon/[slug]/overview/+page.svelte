<script lang="ts">
    import { resolve } from '$app/paths';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import ParticipationCard from '$lib/components/hackathon/ParticipationCard.svelte';
    import PhaseTimeline from '$lib/components/hackathon/PhaseTimeline.svelte';
    import { currentPhase, phaseStatus } from '$lib/utils/phase';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    const hackathon = $derived(data.hackathon);
    const myTeam = $derived(data.myTeam);
    const approvedCount = $derived(data.approvedCount);
    const trackCounts = $derived(data.trackCounts);

    // Everything the hero used to show now lives in the page body.
    const participantCount = $derived(hackathon.members.length);
    const phases = $derived(
        hackathon.phases.map((p) => ({
            id: p.id,
            name: p.name,
            status: phaseStatus(p.startsAt, p.endsAt),
        })),
    );
    const now = $derived(currentPhase(hackathon.phases));

    const facts = $derived([
        { label: 'Participants', value: participantCount },
        { label: 'Tracks', value: hackathon.tracks.length },
        { label: 'Projects', value: approvedCount },
        { label: 'Phases', value: hackathon.phases.length },
    ]);

    function formatDate(d: Date | undefined): string {
        if (!d) return '';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <!-- At a glance: logo, blurb and the counts that used to sit in the hero. -->
    <section class="card preset-outlined-surface-200-800 overflow-hidden">
        <div class="flex flex-col md:flex-row">
            {#if hackathon.logo}
                <div
                    class="aspect-[16/9] w-full shrink-0 overflow-hidden border-b border-surface-200-800
                           md:aspect-auto md:h-auto md:w-64 md:border-b-0 md:border-r"
                >
                    <img
                        src={hackathon.logo}
                        alt={hackathon.name}
                        class="h-full w-full object-cover"
                    />
                </div>
            {/if}

            <div class="flex min-w-0 flex-1 flex-col gap-4 p-5">
                <h2 class="m-0 text-base font-bold text-surface-950-50">About this hackathon</h2>

                {#if hackathon.description}
                    <div class="text-sm leading-relaxed text-surface-700-300">
                        <MarkdownContent content={hackathon.description} />
                    </div>
                {:else}
                    <p class="m-0 text-sm text-surface-500">No description has been added yet.</p>
                {/if}

                <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {#each facts as fact (fact.label)}
                        <div class="flex flex-col gap-0.5 bg-primary-500/5 p-3 dark:bg-primary-950">
                            <span class="text-xl font-bold text-surface-950-50">{fact.value}</span>
                            <span class="text-xs text-surface-500">{fact.label}</span>
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    </section>

    <!-- Where the event stands right now. -->
    {#if phases.length > 0}
        <section class="card preset-outlined-surface-200-800 flex flex-col gap-3 p-5">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="m-0 text-base font-bold text-surface-950-50">Timeline</h2>
                {#if now}
                    <span class="text-xs text-surface-500">
                        {#if now.active}
                            Now: <span class="font-semibold text-primary-700-300">{now.phase.name}</span>
                        {:else}
                            Next: <span class="font-semibold text-primary-700-300">{now.phase.name}</span>
                            {#if now.phase.startsAt}· starts {formatDate(now.phase.startsAt)}{/if}
                        {/if}
                    </span>
                {/if}
            </div>

            <PhaseTimeline {phases} />

            <a
                href={resolve(`/hackathon/${hackathon.id}/timeline`)}
                class="text-xs font-semibold text-primary-700-300 no-underline hover:underline"
            >
                View full timeline →
            </a>
        </section>
    {/if}

    {#if myTeam}
        <ParticipationCard
            teamName={myTeam.name}
            teamMemberCount={myTeam.memberCount}
            projectName={myTeam.projectName}
            projectTrack={myTeam.projectTrack}
            projectStatus={myTeam.projectStatus}
            nextAction="View Team"
            nextActionHref="/hackathon/{hackathon.id}/teams/{myTeam.id}"
        />
    {:else}
        <div class="card preset-outlined-surface-200-800 p-5">
            <h2 class="mb-2 text-base font-bold">Your Participation</h2>
            <p class="m-0 text-sm text-surface-500">
                You haven't been assigned to a team yet. Check the
                <a
                    href={resolve(`/hackathon/${hackathon.id}/teams`)}
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
            href={resolve(`/hackathon/${hackathon.id}/proposals`)}
            class="block text-center text-xs font-semibold text-primary-700-300 no-underline hover:underline"
        >
            View all {approvedCount} projects →
        </a>
    </div>
</div>
