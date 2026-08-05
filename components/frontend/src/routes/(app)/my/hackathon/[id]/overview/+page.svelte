<script lang="ts">
    import { resolve } from '$app/paths';
    import ParticipationCard from '$lib/components/hackathon/ParticipationCard.svelte';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import { membershipBadgeVariant } from '$lib/utils/hackathonStatus';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const projectCountLabel = $derived(
        data.approvedCount === 1 ? '1 project' : `${data.approvedCount} projects`
    );

    // Two tones alternating, which is what the track boxes have always looked
    // like — except the count of tracks is now whatever the hackathon defines
    // rather than the two the placeholder hardcoded.
    function trackTone(i: number): { box: string; text: string } {
        return i % 2 === 0
            ? { box: 'bg-accent/10', text: 'text-accent-ink' }
            : { box: 'bg-info/10', text: 'text-info-ink' };
    }
</script>

<!--
  One centred column, capped narrower than the full-width list pages: this page is
  cards and prose rather than a table of rows, and an About paragraph spanning the
  whole of a wide viewport is unreadable.
-->
<div class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-10">
    {#if data.myTeam}
        <ParticipationCard
            membershipLabel={data.membershipLabel}
            membershipIsWaiting={data.membershipIsWaiting}
            teamName={data.myTeam.name}
            teamRole={data.myTeam.role}
            teamMemberCount={data.myTeam.memberCount}
            projectName={data.myTeam.projectName}
            projectTrack={data.myTeam.projectTrack}
            projectStatus={data.myTeam.projectStatus}
        />
    {:else}
        <div class="card p-5">
            <div class="mb-3 flex items-center justify-between">
                <h2 class="text-section">Your Participation</h2>
                <span class="badge {membershipBadgeVariant(data.membershipIsWaiting)}">
                    {data.membershipLabel}
                </span>
            </div>
            <p class="text-sm text-ink-2">
                You are not on a team yet.
            </p>
        </div>
    {/if}

    <!-- The registration form has no link anywhere else in the UI: without this
         you can only reach it by knowing the URL, so answers are effectively
         write-once even though the backend accepts edits (SubmitRegistrationForm
         is an upsert). Waitlisted registrants especially — an organiser reviews
         exactly these answers. -->
    {#if data.hackathon.registrationForm}
        <div class="card flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
                <h2 class="m-0 text-section">Your registration answers</h2>
                <p class="mt-1 text-sm text-ink-3">
                    What this event asked when you joined. You can change your answers while
                    it runs.
                </p>
            </div>
            <a href="/register/{data.hackathon.id}" class="btn btn-sm no-underline">
                View or edit
            </a>
        </div>
    {/if}

    <div class="card p-5">
        <h2 class="mb-3 text-section">About</h2>
        {#if data.hackathon.description}
            <!-- Markdown, because that is what the organiser wrote it in — this
                 rendered the source as plain text, `#` and `*` included. -->
            <div class="text-sm leading-relaxed text-ink-2">
                <MarkdownContent content={data.hackathon.description} />
            </div>
        {:else}
            <p class="text-sm text-ink-3">No description provided.</p>
        {/if}
    </div>

    <div class="card p-5">
        <div class="mb-4 flex items-center justify-between">
            <h2 class="text-section">Projects</h2>
            <span class="text-xs text-ink-3">{projectCountLabel}</span>
        </div>

        {#if data.trackCounts.length > 0}
            <div class="mb-4 flex flex-wrap gap-3">
                {#each data.trackCounts as track, i (track.id)}
                    {@const tone = trackTone(i)}
                    <div
                        class="flex min-w-[8rem] flex-1 flex-col gap-1 rounded-card p-3 {tone.box}"
                    >
                        <span class="meta {tone.text}">{track.name}</span>
                        <span class="tnum text-xs text-ink-3">
                            {track.count === 1 ? '1 project' : `${track.count} projects`}
                        </span>
                    </div>
                {/each}
            </div>
        {/if}

        {#if data.previewProjects.length === 0}
            <p class="m-0 py-3 text-sm text-ink-3">
                No projects have been approved yet.
            </p>
        {:else}
            <!--
              No per-row "More Info" button: there is no project detail route to
              send anyone to, and a row that only looks clickable is worse than a
              row that plainly is not. The link below reaches the real list.
            -->
            {#each data.previewProjects as project (project.id)}
                <div class="flex items-start gap-3 border-t border-line py-3">
                    <div class="h-12 w-12 shrink-0 bg-raised"></div>
                    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span class="text-xs font-semibold">{project.num}. {project.title}</span>
                        <span class="truncate text-xs text-ink-3">{project.description}</span>
                        {#if project.creator}
                            <span class="text-xs text-ink-3">Proposed by {project.creator}</span>
                        {/if}
                    </div>
                </div>
            {/each}

            <!-- resolve() called inline: svelte/no-navigation-without-resolve
                 only recognizes it at the href, not via a $derived. -->
            <a
                href={resolve(`/my/hackathon/${data.hackathon.id}/projects`)}
                class="mt-2 block text-center text-xs font-semibold text-accent-ink no-underline hover:underline"
            >
                View all {projectCountLabel} →
            </a>
        {/if}
    </div>
</div>
