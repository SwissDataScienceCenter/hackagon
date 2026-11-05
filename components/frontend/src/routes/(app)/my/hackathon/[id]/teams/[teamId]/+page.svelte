<script lang="ts">
    import { resolve } from '$app/paths';
    import ProjectCard from '$lib/components/hackathon/ProjectCard.svelte';
    import TeamMembers from '$lib/components/hackathon/TeamMembers.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    // Same wording and format as the card on Submissions, which is where the
    // entry link below lands.
    function formatDate(d: Date | undefined): string {
        if (!d) return '';
        return d.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    }
</script>

<!--
  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/projects/voting).

  The team is the heading: people arrive from the teams list, a profile or
  Submissions, all asking about a team. Below it, three sections — its people,
  the project it works on, and whether it has handed anything in — each the
  way that thing is drawn elsewhere, so nothing here has a look of its own.

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
        <h2 class="m-0 text-title text-ink">{data.teamName}</h2>
        <span class="text-xs text-ink-3">
            {data.members.length === 1 ? '1 member' : `${data.members.length} members`}
        </span>
    </div>

    <section class="flex flex-col gap-2">
        <h3 class="meta m-0">Members</h3>
        <TeamMembers
            members={data.members.map((m) => ({
                name: m.name,
                href: resolve(`/my/hackathon/${data.hackathonId}/participants/${m.id}`),
            }))}
        />
    </section>

    {#if data.project}
        <section class="flex flex-col gap-2">
            <h3 class="meta m-0">Project</h3>
            <!--
              The projects list's own card, its View the way onto the project.

              `?from=team` carries this team back, so the chain stays reversible
              instead of returning to a projects list the reader was never on,
              and `teamFrom` carries one more hop — where *this* page came from —
              so returning here restores this page's own back link rather than
              resetting it to the default.
            -->
            <ProjectCard
                title={data.project.title}
                excerpt={data.project.excerpt}
                creator={data.project.creator}
                track={data.project.track}
                imageUrl={data.project.imageUrl}
                moreInfoHref="/my/hackathon/{data.hackathonId}/projects/{data.project
                    .id}?from=team&team={data.teamId}{data.backToTeams
                    ? '&teamFrom=teams'
                    : ''}"
            />
        </section>
    {/if}

    <section class="flex flex-col gap-2">
        <h3 class="meta m-0">Submission</h3>
        {#if data.entry}
            <!-- When and by whom only: the entry is read on Submissions, where
                 this links to the team's own card. -->
            <div
                class="card card-raised box-border flex w-full flex-wrap items-center
                       justify-between gap-2 px-5 py-4"
            >
                <span class="text-xs text-ink-3">
                    <!-- One expression rather than an `{#if}` block: Svelte trims
                         the whitespace that opens a block, which glued "by" to
                         the time ("11:22 AMby"). -->
                    Last updated {formatDate(data.entry.updatedAt)}{data.entry.updatedBy
                        ? ` by ${data.entry.updatedBy}`
                        : ''}
                </span>
                <a
                    href="{resolve(
                        `/my/hackathon/${data.hackathonId}/submissions`
                    )}#team-{data.teamId}"
                    class="btn btn-sm btn-ghost no-underline"
                >
                    View entry
                </a>
            </div>
        {:else}
            <p class="m-0 text-xs text-ink-3">Not submitted yet</p>
        {/if}
    </section>
</div>
