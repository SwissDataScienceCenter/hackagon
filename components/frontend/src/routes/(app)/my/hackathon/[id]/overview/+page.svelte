<script lang="ts">
    import { resolve } from '$app/paths';
    import CurrentStateCard from '$lib/components/hackathon/CurrentStateCard.svelte';
    import ParticipationCard from '$lib/components/hackathon/ParticipationCard.svelte';
    import TrackBreakdown from '$lib/components/hackathon/TrackBreakdown.svelte';
    import { membershipBadgeVariant } from '$lib/utils/hackathonRole';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    // Whether there is a Projects card at all. With no track to group by and no
    // approved project to count it would be an empty box holding half the row —
    // and the way in to proposing one is already a row on the state card above.
    const showProjects = $derived(data.trackCounts.length > 0 || data.approvedCount > 0);
</script>

<!--
  The member's overview, and participant-shaped for every viewer — an organiser
  reading it sees what a participant sees. Nothing an organiser *acts on* belongs
  here: their queues and switches live on Settings, the organiser's own page,
  which badges each count onto the tile that clears it.

  Order is by how fast it changes, and only things that change are here at all.
  "Right now" leads because it differs from one visit to the next. The About
  section is gone: a description is read once, ever, so it sits with the rest of
  the hackathon's identity in the hero — and the dashboard card a member clicks to
  get here already carries it.

  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/projects).
  No width cap of its own — `.prose` caps the one thing here that needs a measure.
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <!-- What a participant came to find out is whether they can act right now,
         and until this card existed the only way to learn it was to try something
         and be refused. `hackathonState` comes from the hackathon layout, so the
         card, the organiser bar and the sidebar badge all read one derivation.

         Participant-shaped for everyone, including organisers, who see exactly
         what a participant sees in the third person — their own controls live on
         Settings. -->
    <CurrentStateCard
        hackathonId={data.hackathon.id}
        organiserVoice={data.hackathonState.canManage}
        isWaiting={data.membershipIsWaiting}
        hasState={data.hackathonState.hasState}
        declared={data.hackathonState.declared}
        currentPhase={data.hackathonState.currentPhase}
        nextPhase={data.hackathonState.nextPhase}
        enabled={data.hackathonState.enabled}
    />

    <!-- Two-up from md: both of these are naturally narrow — a handful of labelled
         values and a short bar chart — and stacked full width they were two
         mostly-empty rectangles. One column when there is no Projects card, so the
         team card takes the width rather than leaving half the row empty.

         `items-start`, so the shorter card keeps its own height instead of being
         stretched to the taller one's and floating in its own whitespace. -->
    <div class="grid items-start gap-6 {showProjects ? 'md:grid-cols-2' : ''}">
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

        {#if showProjects}
            <TrackBreakdown
                hackathonId={data.hackathon.id}
                approvedCount={data.approvedCount}
                tracks={data.trackCounts}
            />
        {/if}
    </div>
</div>
