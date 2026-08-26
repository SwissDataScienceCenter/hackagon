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

    // An organizer or you get the section whenever the form exists at all, so
    // "has not answered" can be said. A peer gets it only when something was
    // actually shared: an empty list there means the event shares nothing, which
    // is not a fact about this person and reads as one if a heading appears
    // above it.
    const answersSection = $derived(
        data.answerScope === 'public' ? data.answers.length > 0 : data.questionCount > 0
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

  Registration answers are the exception to "this page reads the same for
  everyone". An organizer reads the whole form — this is where they read it, now
  that Manage Participants links here instead of unfolding it in its own rows.
  You read your own, whether or not the event shares them. A peer reads only the
  questions the organizer marked "show answers to participants", which the
  backend has already filtered down before the load sees it.

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
                {data.answerScope === 'public' ? 'Shared answers' : 'Registration answers'}
            </h3>
            <!-- Who can see this, said on the page rather than left to be
                 assumed: on your own profile because you are looking at your own
                 answers and may reasonably wonder, on an organizer's because
                 they are reading things the person did not publish, and on a
                 peer's because "shared" is a claim worth attributing to the
                 event rather than to the person. -->
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
            {:else if data.answerScope === 'organizer'}
                <p class="m-0 text-xs text-ink-3">
                    Organizers see all of these. Only the ones marked
                    <span class="font-semibold text-ink-3">Shared</span>
                    are visible to other participants — the
                    <a
                        href={resolve(`/my/hackathon/${data.hackathonId}/manage/forms`)}
                        class="font-semibold text-accent-ink no-underline hover:underline"
                    >
                        registration form</a
                    > is where that is decided.
                </p>
            {:else}
                <p class="m-0 text-xs text-ink-3">
                    Answers this event shares with everyone taking part. The rest of
                    {data.participant.name}'s form is between them and the organizers.
                </p>
            {/if}

            {#if data.answers.length === 0}
                <!-- Only reachable for an organizer or for you: for a peer an
                     empty list means "nothing shared", which is a fact about the
                     form and not about the person, so no section is drawn at
                     all. -->
                <p class="m-0 text-xs text-ink-3">
                    {data.answerScope === 'mine'
                        ? 'You have not answered the registration form.'
                        : `${data.participant.name} has not answered the registration form.`}
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
                            <!-- Not on a peer's profile: there every entry is
                                 shared, so a chip on all of them says nothing. -->
                            {#if answer.publicAnswers && data.answerScope !== 'public'}
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
