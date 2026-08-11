<script lang="ts">
    import { resolve } from '$app/paths';
    import CurrentStateCard from '$lib/components/hackathon/CurrentStateCard.svelte';
    import OrganiserOpsCard from '$lib/components/hackathon/OrganiserOpsCard.svelte';
    import ParticipationCard from '$lib/components/hackathon/ParticipationCard.svelte';
    import TrackBreakdown from '$lib/components/hackathon/TrackBreakdown.svelte';
    import { membershipBadgeVariant } from '$lib/utils/hackathonRole';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<!--
  An organiser gets their queues in the grid's first slot and a participant gets
  their team. An organiser who is also on a team is the case that needs a snippet:
  they get both — queues in the grid, team below it — rather than either being
  silently dropped, and the card is too many props to spell out twice.
-->
{#snippet participation(team: NonNullable<PageData['myTeam']>)}
    <ParticipationCard
        hackathonId={data.hackathon.id}
        membershipLabel={data.membershipLabel}
        membershipIsWaiting={data.membershipIsWaiting}
        teamName={team.name}
        teamRole={team.role}
        memberNames={team.memberNames}
        projectName={team.projectName}
        projectTrack={team.projectTrack}
        projectStatus={team.projectStatus}
        submissionCount={team.submissionCount}
        canSubmit={data.canSubmit}
    />
{/snippet}

<!--
  Left-aligned and capped, rather than centred: every sibling page sits in the
  layout's `max-w-7xl` container, so a centred narrower column here slid the
  content sideways on the way in and out of Overview. Capping without `mx-auto`
  keeps the left edge where the rest of the hackathon put it while still holding a
  readable measure.

  Order is by how fast it changes. "Right now" leads because it is the only thing
  on the page that is different from one visit to the next; About is last because
  it is read once, ever, and had been sitting between two things that are not.
-->
<div class="flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-10">
    <!-- What a participant came to find out is whether they can act right now,
         and until this card existed the only way to learn it was to try something
         and be refused. `hackathonState` comes from the hackathon layout, so the
         card, the organiser bar and the sidebar badge all read one derivation.

         Participant-shaped for everyone, including organisers, who see exactly
         what a participant sees in the third person — their own controls live on
         Manage Hackathon, and their own queues in the card below. -->
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
         mostly-empty rectangles. -->
    <div class="grid gap-6 md:grid-cols-2">
        {#if data.ops}
            <OrganiserOpsCard
                hackathonId={data.hackathon.id}
                awaitingApproval={data.ops.awaitingApproval}
                proposalsToReview={data.ops.proposalsToReview}
                teamsWithoutProject={data.ops.teamsWithoutProject}
                submissionCount={data.ops.submissionCount}
            />
        {:else if data.myTeam}
            {@render participation(data.myTeam)}
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

    {#if data.ops && data.myTeam}
        {@render participation(data.myTeam)}
    {/if}

    <section class="card p-5" aria-labelledby="about">
        <h2 class="m-0 mb-3 text-section" id="about">About</h2>
        {#if data.hackathon.description}
            <p class="prose m-0 text-sm">{data.hackathon.description}</p>
        {:else}
            <p class="m-0 text-sm text-ink-3">No description provided.</p>
        {/if}
    </section>
</div>
