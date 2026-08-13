<script lang="ts">
    import { resolve } from '$app/paths';
    import CurrentStateCard from '$lib/components/hackathon/CurrentStateCard.svelte';
    import ParticipationCard from '$lib/components/hackathon/ParticipationCard.svelte';
    import TrackBreakdown from '$lib/components/hackathon/TrackBreakdown.svelte';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import { membershipBadgeVariant } from '$lib/utils/hackathonStatus';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<!--
  The member's overview, and participant-shaped for every viewer — an organiser
  reading it sees what a participant sees. Nothing an organiser *acts on* belongs
  here: their queues and switches live on Manage Hackathon, which is the page
  named after that job.

  Order is by how fast it changes. "Right now" leads because it is the only thing
  on the page that differs from one visit to the next; About is last because it is
  read once, ever, and had been sitting between two things that are not.

  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/projects).
  No width cap of its own — `.prose` caps the one thing here that needs a measure.

  Ported from main's `feat(frontend): rebuild the hackathon overview around what
  changes` + `fix(frontend): keep the member overview participant-shaped`, adapted:
  the props CurrentStateCard takes are computed in this route's own
  +page.server.ts rather than read off a layout-wide `hackathonState` — see that
  file's comment for why this branch keeps the two mechanisms separate.
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <!-- What a participant came to find out is whether they can act right now,
         and until this card existed the only way to learn it was to try something
         and be refused.

         Participant-shaped for everyone, including organisers, who see exactly
         what a participant sees in the third person — their own controls live on
         Manage Hackathon. -->
    <CurrentStateCard
        hackathonId={data.hackathon.id}
        capabilities={data.capabilities}
        organiserVoice={data.organiserVoice}
        declared={data.declared}
        currentPhase={data.currentPhase}
        nextPhase={data.nextPhase}
    />

    <!-- Two-up from md: both of these are naturally narrow — a handful of labelled
         values and a short bar chart — and stacked full width they were two
         mostly-empty rectangles. -->
    <div class="grid gap-6 md:grid-cols-2">
        {#if data.myTeam}
            <ParticipationCard
                hackathonId={data.hackathon.id}
                membershipLabel={data.membershipLabel}
                membershipIsWaiting={data.membershipIsWaiting}
                teamName={data.myTeam.name}
                teamRole={data.myTeam.role}
                memberNames={data.myTeam.memberNames}
                projectName={data.myTeam.projectName}
                projectTrack={data.myTeam.projectTrack}
                projectStatus={data.myTeam.projectStatus}
                submissionCount={data.myTeam.submissionCount}
                canSubmit={data.canSubmit}
            />
        {:else}
            <section class="card flex flex-col gap-3 p-5" aria-labelledby="no-team">
                <div class="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 class="m-0 text-section" id="no-team">Your team</h2>
                    <span class="badge {membershipBadgeVariant(data.membershipIsWaiting)}">
                        {data.membershipLabel}
                    </span>
                </div>
                <p class="prose m-0 text-sm">You are not on a team yet.</p>
                <!-- Somewhere to go, which the bare statement never gave them.
                     The projects list is where a team forms, and it is a page every
                     confirmed member may read. -->
                {#if !data.membershipIsWaiting}
                    <a
                        href={resolve(`/my/hackathon/${data.hackathon.id}/projects`)}
                        class="text-xs font-semibold text-accent-ink no-underline hover:underline"
                    >
                        Browse the projects →
                    </a>
                {/if}
            </section>
        {/if}

        <TrackBreakdown
            hackathonId={data.hackathon.id}
            approvedCount={data.approvedCount}
            tracks={data.trackCounts}
        />
    </div>

    <section class="card p-5" aria-labelledby="about">
        <h2 class="m-0 mb-3 text-section" id="about">About</h2>
        {#if data.hackathon.description}
            <!-- Markdown, because that is what the organiser wrote it in — main's
                 ported version rendered the source as plain text here, `#` and `*`
                 included; kept as MarkdownContent instead. -->
            <div class="prose text-sm leading-relaxed text-ink-2">
                <MarkdownContent content={data.hackathon.description} />
            </div>
        {:else}
            <p class="m-0 text-sm text-ink-3">No description provided.</p>
        {/if}
    </section>
</div>
