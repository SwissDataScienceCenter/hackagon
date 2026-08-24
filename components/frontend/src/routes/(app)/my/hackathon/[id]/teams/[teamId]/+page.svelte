<script lang="ts">
    import { resolve } from '$app/paths';
    import TeamCard from '$lib/components/hackathon/TeamCard.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<!--
  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/projects/voting).

  The project title is the heading and the team name sits inside the card,
  because what a voter is judging is the project — the team is who did it. No
  `num` passed to the card for the same reason: an ordinal is a position in a
  list, and there is no list here.

  Two ways in — the ballot and the teams list — so the back link follows the
  `?from` the teams list sets, and falls back to voting for a bookmark, a reload
  or a shared URL that carries none. See the load.
-->
<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        {#if data.backToTeams}
            <a
                href={resolve(`/my/hackathon/${data.hackathonId}/teams`)}
                class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
            >
                &larr; Back to teams
            </a>
        {:else}
            <a
                href={resolve(`/my/hackathon/${data.hackathonId}/voting`)}
                class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
            >
                &larr; Back to voting
            </a>
        {/if}
        <h2 class="m-0 text-title text-ink">{data.projectTitle}</h2>
        <span class="text-xs text-ink-3">
            {data.members.length === 1 ? '1 member' : `${data.members.length} members`}
        </span>
        {#if data.projectId}
            <!--
              The heading is the project's title, but only its description
              reaches this page and only as plain text — the proposal's own page
              renders it as markdown and carries the track, proposer and status
              besides. Named for what is through there rather than "View
              project", which reads as the thing you are already looking at.

              `?from=team` carries this team back, so the chain stays reversible
              instead of returning to a projects list the reader was never on,
              and `teamFrom` carries one more hop — where *this* page came from —
              so returning here restores this page's own back link rather than
              resetting it to the default.
            -->
            <a
                href="{resolve(
                    `/my/hackathon/${data.hackathonId}/projects/${data.projectId}`
                )}?from=team&team={data.teamId}{data.backToTeams
                    ? '&teamFrom=teams'
                    : ''}"
                class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
            >
                Read the full proposal &rarr;
            </a>
        {/if}
    </div>

    <TeamCard
        title={data.teamName}
        projectDescription={data.projectDescription}
        imageUrl={data.imageUrl}
        members={data.members}
        isOwn={data.isOwn}
        entry={data.entry}
    />

    {#if !data.entry}
        <!-- Said outright rather than left blank: a team with no finalized entry
             is not on any ballot, and a voter who followed a link here from one
             would otherwise be looking at a card with a piece missing. -->
        <p class="m-0 text-xs text-ink-3">
            This team has not finalized an entry, so there is nothing to vote on yet.
        </p>
    {/if}
</div>
