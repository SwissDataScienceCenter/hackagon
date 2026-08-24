<script lang="ts">
    import { resolve } from '$app/paths';
    import TeamCard from '$lib/components/hackathon/TeamCard.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const countLabel = $derived(
        data.teams.length === 1 ? '1 team' : `${data.teams.length} teams`
    );

    // The rows are sorted by project, so a project's teams arrive together and
    // its title only has to be drawn above the first of them — a second
    // hackathon can staff one project with several teams, and repeating the
    // title on each read as part of the team's own name.
    const rows = $derived(
        data.teams.map((team, i) => ({
            team,
            startsProject:
                team.projectTitle !== '' &&
                (i === 0 || data.teams[i - 1].projectTitle !== team.projectTitle),
        }))
    );
</script>

<!--
  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/projects/voting).

  Who is on which team, and nothing to act on: creating, renaming and staffing
  teams are organiser actions on `teams/manage` (see $lib/navigation's
  manageNav). The one control on a row is View, onto the team's detail page —
  the row shows the roster, and the entry a team filed only exists there.

  No search, unlike the participants page: a hackathon has a hundred
  participants and at most one team per approved project, so there is no list
  long enough to need filtering yet.
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-1">
        <h2 class="m-0 text-title text-ink">Teams</h2>
        <span class="text-xs text-ink-3">{countLabel}</span>
    </div>

    <div class="flex w-full flex-col items-stretch gap-2 self-start">
        {#if data.teams.length === 0}
            <!--
              Normally unreachable: the sidebar offers this page only once teams
              exist (see `memberNav`). It is what a bookmarked or shared URL hits
              before team formation, and what a failed count in the layout leaves
              behind, so it says which of the two it is rather than nothing.
            -->
            <p class="m-0 py-6 text-center text-sm text-ink-3">
                No teams have been formed in this hackathon yet.
            </p>
        {:else}
            {#each rows as { team, startsProject } (team.id)}
                <div class="flex flex-col gap-1 {startsProject ? 'mt-2 first:mt-0' : ''}">
                    <!--
                      The project above the card rather than inside it: the card's
                      heading is the team, and carrying the project title in both
                      places made the two read as one name. Absent for a team
                      whose project the viewer cannot see, rather than an empty
                      line.
                    -->
                    {#if startsProject}
                        <span class="meta">{team.projectTitle}</span>
                    {/if}
                    <TeamCard
                        title={team.name}
                        projectDescription={team.projectDescription}
                        imageUrl={team.imageUrl}
                        members={team.members}
                        isOwn={team.isOwn}
                    >
                        {#snippet actions()}
                            <!--
                              `?from=teams` so the detail page comes back here
                              rather than to the ballot — it is reached from both
                              now. See its load.
                            -->
                            <a
                                href="{resolve(
                                    `/my/hackathon/${data.hackathonId}/teams/${team.id}`
                                )}?from=teams"
                                class="btn btn-sm btn-ghost no-underline"
                            >
                                View
                            </a>
                        {/snippet}
                    </TeamCard>
                </div>
            {/each}
        {/if}
    </div>
</div>
