<script lang="ts">
    import { resolve } from '$app/paths';
    import AnswerText from '$lib/components/hackathon/AnswerText.svelte';
    import { membershipBadgeVariant } from '$lib/utils/hackathonRole';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Closed until asked for, the same way rejecting a project is: removing
    // somebody is the one decision here that cannot be taken back — the
    // participant row is deleted — so it asks a second time rather than sitting
    // live beside Approve.
    let removing = $state(false);

    // Reset when the page swaps to another person: this component stays mounted
    // across a client-side navigation between two rows, and an open confirm box
    // carrying over onto the next participant is exactly the wrong click.
    let shownId = data.participant.id;
    $effect(() => {
        if (data.participant.id !== shownId) {
            shownId = data.participant.id;
            removing = false;
        }
    });

    // The tab suffix only, not the whole href: svelte/no-navigation-without-resolve
    // reads the href expression itself and cannot tell that a variable already
    // holds a resolved path, so `resolve()` has to sit inline below. Same shape
    // as ParticipantsManageTabs and ProjectStatusTabs.
    const backTab = $derived(data.from === 'waitlist' ? '/waitlist' : '');
    const backLabel = $derived(
        data.from === 'waitlist' ? 'Back to Waitlist' : 'Back to Manage Participants'
    );

    const initials = $derived(
        data.participant.name
            .split(' ')
            .filter(Boolean)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)
    );

    const dated = $derived(
        data.participant.joinedAt
            ? data.participant.joinedAt.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
              })
            : null
    );

    // Removing reads as declining while they are still waiting: same RPC, and
    // the word is chosen for what it does to the applicant.
    const removeLabel = $derived(
        data.participant.isWaiting ? 'Decline' : 'Remove from hackathon'
    );
</script>

<!--
  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches the other manage pages).

  One person, and everything an organizer can do about them. The two tabs that
  lead here list and nothing more — the same trade the projects queue makes: what
  it costs is the one-click sweep down a long waitlist, what it buys is that
  nobody approves or removes somebody without opening what they wrote.

  This is also the only page that shows an organizer the *whole* registration
  form. `participants/[participantId]` stays the participant view and shows the
  shared answers only, to an organizer included.
-->
<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <a
        href="{resolve(
            `/my/hackathon/${data.hackathonId}/participants/manage`
        )}{backTab}"
        class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
    >
        &larr; {backLabel}
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
                <!-- Shown here and nowhere else a peer can reach: an organizer
                     already downloads every address on the roster's CSV, and
                     needing one to answer a question about somebody's
                     application should not mean opening a spreadsheet. -->
                <p class="m-0 text-xs leading-snug text-ink-3">
                    {#if data.participant.email !== ''}
                        {data.participant.email}
                    {:else}
                        No email address — they are left out of the roster CSV.
                    {/if}
                </p>
                <div class="flex flex-wrap items-center gap-2">
                    <span class="badge {membershipBadgeVariant(data.participant.isWaiting)}">
                        {data.participant.roleLabel}
                    </span>
                    {#if dated}
                        <span class="text-xs text-ink-3">
                            {data.participant.isWaiting ? 'Applied' : 'Joined'}
                            {dated}
                        </span>
                    {/if}
                </div>
            </div>
        </div>
    </div>

    <section class="flex flex-col gap-2">
        <h3 class="m-0 text-sm font-semibold text-ink">Registration answers</h3>
        {#if data.answersFailed}
            <!-- Said outright rather than shown as an empty form: "answered
                 nothing" is what an organizer decides on, and a failed call is no
                 basis for it. -->
            <p class="m-0 text-xs text-ink-3">
                Answers could not be loaded. Reload the page to try again.
            </p>
        {:else if data.questionCount === 0}
            <p class="m-0 text-xs text-ink-3">
                This hackathon's registration form asks nothing yet.
            </p>
        {:else if data.answers.length === 0}
            <p class="m-0 text-xs text-ink-3">
                {data.participant.name} has not answered the registration form.
            </p>
        {:else}
            <!-- Open, not a fold-out: the waitlist is where a queue of these had
                 to collapse, and this page shows one person. Every answer is
                 here, including the ones the event keeps between the organizers
                 and the applicant — the chip marks which of them the rest of the
                 hackathon can also read. -->
            <dl class="m-0 flex flex-col gap-1 border-l border-line pl-3">
                {#each data.answers as answer (answer.questionId)}
                    <div class="flex flex-wrap items-center gap-x-2">
                        <dt class="text-xs text-ink-3">{answer.label}</dt>
                        <!-- `min-w-0` so a pasted address wraps rather than
                             widening the row: see the participant profile. -->
                        <dd class="m-0 min-w-0 break-words text-xs text-ink">
                            <AnswerText value={answer.value} />
                        </dd>
                        {#if answer.publicAnswers}
                            <span class="badge badge-neutral">Shared</span>
                        {/if}
                    </div>
                {/each}
            </dl>
        {/if}
    </section>

    <section class="flex flex-col gap-2">
        <h3 class="m-0 text-sm font-semibold text-ink">Teams</h3>
        <!-- Same three outcomes as the member-facing profile. An owner reads
             teams whether or not they are published, so this branch is the
             global-admin-who-is-not-the-owner case rather than the common one. -->
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
    </section>

    <section class="flex flex-col gap-3">
        <h3 class="m-0 text-sm font-semibold text-ink">Manage</h3>

        {#if form?.message}
            <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
        {/if}

        <!-- `from` rides every action attribute: posting to `?/approve` replaces
             the whole query string, so a `from` left in the page URL alone would
             be gone by the time the action reads it — and an organizer working
             down the waitlist would be redirected to the roster instead. -->
        {#if removing}
            <!-- Only the confirmation while it is open, for the same reason the
                 project reject form takes the page over: nothing else here should
                 be one mis-click away from a deletion. -->
            <div class="flex flex-col gap-2">
                <p class="m-0 max-w-[60ch] text-xs text-ink-2">
                    {#if data.participant.isWaiting}
                        Declining deletes {data.participant.name}'s application. There is no
                        rejected state to come back to — they can ask to join again, and
                        their answers to the registration form are kept.
                    {:else}
                        Removing {data.participant.name} takes them out of the hackathon and
                        revokes their access to it. Their answers to the registration form
                        are kept, and their teams are not changed. They can ask to join
                        again.
                    {/if}
                </p>
                <div class="flex flex-wrap items-center gap-2">
                    <form method="POST" action="?/remove&from={data.from}">
                        <input type="hidden" name="userId" value={data.participant.id} />
                        <button type="submit" class="btn btn-sm btn-danger">
                            {data.participant.isWaiting
                                ? 'Decline this application'
                                : `Remove ${data.participant.name}`}
                        </button>
                    </form>
                    <button
                        type="button"
                        onclick={() => (removing = false)}
                        class="btn btn-sm btn-ghost"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        {:else}
            <!-- Constructive first, destructive last, at every state — so the
                 button in a given position does not change meaning as an
                 organizer works down a queue. -->
            <div class="flex flex-wrap items-center gap-2">
                {#if data.mayApprove}
                    <form method="POST" action="?/approve&from={data.from}">
                        <input type="hidden" name="userId" value={data.participant.id} />
                        <button type="submit" class="btn btn-sm btn-solid">Approve</button>
                    </form>
                {/if}
                {#if data.mayPromote}
                    <form method="POST" action="?/promote&from={data.from}">
                        <input type="hidden" name="userId" value={data.participant.id} />
                        <button type="submit" class="btn btn-sm btn-outline">Make owner</button>
                    </form>
                {/if}
                {#if data.mayDemote}
                    <form method="POST" action="?/demote&from={data.from}">
                        <input type="hidden" name="userId" value={data.participant.id} />
                        <button type="submit" class="btn btn-sm btn-quiet">Remove owner</button>
                    </form>
                {/if}
                {#if data.mayRemove}
                    <button
                        type="button"
                        onclick={() => (removing = true)}
                        class="btn btn-sm btn-danger"
                    >
                        {removeLabel}
                    </button>
                {/if}
            </div>

            <!-- Why an owner has no Remove, said rather than left as a missing
                 button: the two-step is the path, not a refusal. -->
            {#if data.isOwner}
                <p class="m-0 max-w-[60ch] text-xs text-ink-3">
                    {#if data.isMe}
                        You cannot remove your own owner role here — it is what this page
                        runs on. Another owner can, on this page.
                    {:else}
                        An owner cannot be removed from the hackathon while they hold the
                        role. Remove owner first, then remove them.
                    {/if}
                </p>
            {/if}
        {/if}
    </section>
</div>
