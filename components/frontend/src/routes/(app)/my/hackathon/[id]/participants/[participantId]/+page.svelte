<script lang="ts">
    import { resolve } from '$app/paths';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const initials = $derived(
        data.participant.name
            .split(' ')
            .filter(Boolean)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)
    );

    const joined = $derived(
        data.participant.joinedAt
            ? data.participant.joinedAt.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
              })
            : null
    );
</script>

<!--
  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/projects).

  A read-only profile: nothing here acts on the person. Approve, Remove and
  Promote live on Manage Participants (see $lib/navigation's manageNav), which is
  the one place an owner's extra capabilities are collected, and duplicating them
  here would mean two surfaces to keep in step with the same casbin rules.

  Email is deliberately absent. `User` carries one, but today it is shown only on
  the platform admin page (/manage/users) — never to a peer — and this page is
  readable by every confirmed member of the hackathon.

  TODO(backend: user-profile-fields): name, role, join date and teams are all
  there is to show. `User` carries only username, displayName, email and
  keycloakId, so there is no affiliation, bio, avatar, skill list or LinkedIn URL
  to put here. Sections for those go in below the header once the fields land;
  nothing is stubbed in the meantime, because an empty "About" card tells a
  reader this person filled nothing in rather than that the platform cannot ask.
-->
<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <a
        href={resolve(`/my/hackathon/${data.hackathonId}/participants`)}
        class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
    >
        &larr; Back to participants
    </a>

    <div class="card card-raised box-border w-full px-5 py-4">
        <div class="flex w-full items-start gap-4">
            <div
                class="flex size-16 shrink-0 items-center justify-center rounded-full
                       border-2 border-line bg-overlay text-xs font-bold text-ink"
            >
                {initials}
            </div>

            <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                <h2 class="m-0 text-title leading-snug text-ink">{data.participant.name}</h2>
                <p class="m-0 text-xs leading-snug text-ink-3">@{data.participant.username}</p>
                <div class="flex flex-wrap items-center gap-2">
                    <!-- Always the confirmed variant: a waitlisted member never
                         resolves to this page at all. -->
                    <span class="badge badge-success">{data.participant.roleLabel}</span>
                    {#if joined}
                        <span class="text-xs text-ink-3">Joined {joined}</span>
                    {/if}
                </div>
            </div>
        </div>
    </div>

    <div class="flex flex-col gap-2">
        <h3 class="m-0 text-sm font-semibold text-ink">Teams</h3>
        {#if data.teamsFailed}
            <!-- Said outright rather than shown as an empty list: "not on a team"
                 is a claim about this person, and a failed load is no basis for
                 it. -->
            <p class="m-0 text-xs text-ink-3">
                Teams could not be loaded. Reload the page to try again.
            </p>
        {:else if data.teams.length === 0}
            <p class="m-0 text-xs text-ink-3">
                {data.participant.name} is not on a team in this hackathon yet.
            </p>
        {:else}
            {#each data.teams as team (team.id)}
                <a
                    href={resolve(`/my/hackathon/${data.hackathonId}/teams/${team.id}`)}
                    class="card card-raised box-border flex w-full flex-col gap-1 px-5 py-4
                           no-underline hover:border-accent"
                >
                    <span class="text-sm leading-snug text-ink">{team.name}</span>
                    {#if team.projectTitle}
                        <span class="text-xs leading-snug text-ink-2">{team.projectTitle}</span>
                    {/if}
                </a>
            {/each}
        {/if}
    </div>
</div>
