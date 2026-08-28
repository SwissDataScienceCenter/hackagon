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

    // Your own profile gets the section whenever the form exists at all, so "you
    // have not answered" can be said. Anyone else's gets it only when something
    // was actually shared: an empty list there means the event shares nothing,
    // which is not a fact about this person and reads as one if a heading
    // appears above it.
    const answersSection = $derived(
        data.answerScope === 'mine' ? data.questionCount > 0 : data.answers.length > 0
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

  A read-only profile: nothing here acts on the person. Approve, Remove and the
  owner controls live on the organizer's own view of this participant,
  `participants/manage/<id>` (see $lib/navigation's manageNav), and duplicating
  them here would mean two surfaces to keep in step with the same casbin rules.

  Email is deliberately absent. `User` carries one, but today it is shown only on
  the platform admin page (/manage/users) — never to a peer — and this page is
  readable by every confirmed member of the hackathon.

  Registration answers keep that promise rather than breaking it. You see your
  own whole form; everyone else — an organizer included — sees only the questions
  marked "show answers to participants". An organizer reaching this page from
  Manage Participants is reaching it to see what a participant sees, and their
  hackathon write is deliberately not spent here.

  The unshared answers an organizer collects are read on that page instead, which
  asks for them by name and gets the whole form. This one stays the participant
  view whoever opens it.

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

    {#if answersSection}
        <div class="flex flex-col gap-2">
            <h3 class="m-0 text-sm font-semibold text-ink">
                {data.answerScope === 'mine' ? 'Registration answers' : 'Shared answers'}
            </h3>
            <!-- Who can see this, said on the page rather than left to be
                 assumed: on your own profile because you are looking at your own
                 answers and may reasonably wonder, and on anyone else's because
                 "shared" is a claim worth attributing to the event rather than
                 to the person. -->
            {#if data.answerScope === 'mine'}
                <p class="m-0 text-xs text-ink-3">
                    The hackathon's organizers see all of these. The ones marked
                    <span class="font-semibold text-ink-3">Shared</span>
                    are also visible to everyone in the hackathon. Change them on the
                    <a
                        href={resolve(`/register/${data.hackathonId}`)}
                        class="font-semibold text-accent-ink no-underline hover:underline"
                    >
                        registration form</a
                    >.
                </p>
            {:else}
                <p class="m-0 text-xs text-ink-3">
                    Answers this event shares with everyone taking part. The rest of
                    {data.participant.name}'s form is between them and the organizers.
                </p>
            {/if}

            {#if data.answers.length === 0}
                <!-- Only reachable on your own profile: on anyone else's an empty
                     list means "nothing shared", which is a fact about the form
                     and not about the person, so no section is drawn at all. -->
                <p class="m-0 text-xs text-ink-3">
                    You have not answered the registration form.
                </p>
            {:else}
                <!-- Open, not a fold-out: the roster is where a hundred of these
                     had to collapse, and this page shows one person. -->
                <dl class="m-0 flex flex-col gap-1 border-l border-line pl-3">
                    {#each data.answers as answer (answer.questionId)}
                        <div class="flex flex-wrap items-center gap-x-2">
                            <dt class="text-xs text-ink-3">{answer.label}</dt>
                            <dd class="m-0 text-xs text-ink">
                                {#if typeof answer.value === 'boolean'}
                                    {answer.value ? 'Yes' : 'No'}
                                {:else}
                                    {answer.value}
                                {/if}
                            </dd>
                            <!-- Only on your own profile: on anyone else's every
                                 entry is shared, so a chip on all of them says
                                 nothing. -->
                            {#if answer.publicAnswers && data.answerScope === 'mine'}
                                <span class="badge badge-neutral">Shared</span>
                            {/if}
                        </div>
                    {/each}
                </dl>
            {/if}
        </div>
    {/if}

    <div class="flex flex-col gap-2">
        <h3 class="m-0 text-sm font-semibold text-ink">Teams</h3>
        <!-- Three outcomes, and only the third may say "not on a team": that is a
             claim about this person, and neither a read we are not allowed to make
             nor one that failed is any basis for it. -->
        {#if !data.teamsPublished}
            <p class="m-0 text-xs text-ink-3">
                Team assignments have not been published in this hackathon yet.
            </p>
        {:else if data.teamsFailed}
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
