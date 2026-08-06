<script lang="ts">
    import { enhance } from '$app/forms';
    import { resolve } from '$app/paths';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Submission = PageData['submissions'][number];

    // Submissions by the viewer's own team are never on their ballot — the
    // backend refuses those votes outright, so they are listed as context rather
    // than offered as options.
    const votable = data.submissions.filter((s: Submission) => !s.isOwnTeam);
    const ownTeam = data.submissions.filter((s: Submission) => s.isOwnTeam);

    // One self-contained ballot per category, each carrying its own options, so
    // the template binds to plain properties. Binding into nested lookups
    // (`points[categoryId][submissionId]`) is what an index signature cannot
    // promise is defined, and `bind:` needs something that definitely is.
    //
    // Seeded from the viewer's existing votes so the ballot opens showing what
    // they already chose. Deliberately not re-derived from `data` afterwards: a
    // successful submit reloads the page data, and reseeding mid-edit would
    // discard whatever they had typed but not yet sent.
    const ballots = $state(
        data.categories.map((category) => ({
            category,
            choice: Object.keys(data.myVotes[category.id] ?? {})[0] ?? '',
            entries: votable.map((submission: Submission) => ({
                submission,
                points: data.myVotes[category.id]?.[submission.id] ?? 0
            }))
        }))
    );

    function spent(entries: { points: number }[]): number {
        return entries.reduce((sum, e) => sum + (Number(e.points) || 0), 0);
    }

    function alreadyVoted(categoryId: string): boolean {
        return Object.keys(data.myVotes[categoryId] ?? {}).length > 0;
    }
</script>

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/timeline). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-0.5">
        <h2 class="m-0 text-title text-ink">Voting</h2>
        <span class="text-xs text-ink-3">
            {data.categories.length === 1
                ? '1 category'
                : `${data.categories.length} categories`}
        </span>
    </div>

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {:else if form?.voted}
        <p class="m-0 text-xs text-ink-2" role="status">Your vote has been recorded.</p>
    {/if}

    {#if !data.canVote}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            {data.votingEnabled
                ? 'You need to be a confirmed participant of this hackathon to vote.'
                : 'Voting is not open yet. The organizers will open it when judging starts.'}
        </p>
    {:else if data.categories.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            Voting is open, but there is nothing to vote on yet.
        </p>
    {:else if votable.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            {ownTeam.length > 0
                ? 'The only final submissions are your own team’s, and you cannot vote for those.'
                : 'No team has filed a final submission yet, so there is nothing to vote on.'}
        </p>
    {:else}
        <!-- The ballot lists a project and a team, which is not enough to judge
             on, so every entry links to its own page — that is where the
             submission itself is shown. There is no all-submissions list to send
             people to any more; the per-entry link replaced it, so the way to
             inspect an entry is from the row you are about to vote for. -->
        <p class="m-0 text-xs text-ink-3">
            Want to look before you vote? Open an entry to see the project and what
            it submitted.
        </p>

        {#each ballots as ballot (ballot.category.id)}
            <section class="card card-raised box-border w-full px-5 py-4">
                <!-- reset: false, because the default enhance callback resets the
                     <form> on success — unchecking the radios and blanking the
                     point fields directly in the DOM. form.reset() fires no
                     change event, so the bindings still hold what was cast and
                     never repaint it: the vote is stored but the ballot looks
                     empty. The invalidation still runs, so `data.myVotes`
                     refreshes and the button flips to "Change my vote". -->
                <form
                    method="POST"
                    action="?/vote"
                    use:enhance={() =>
                        ({ update }) =>
                            update({ reset: false })}
                    class="flex flex-col gap-4"
                >
                    <input type="hidden" name="categoryId" value={ballot.category.id} />
                    <input type="hidden" name="method" value={ballot.category.method} />

                    <div class="flex flex-wrap items-center gap-2">
                        <h3 class="m-0 text-sm leading-snug text-ink">{ballot.category.name}</h3>
                        <span class="badge badge-neutral">{ballot.category.methodLabel}</span>
                        {#if ballot.category.isJury}
                            <span class="badge badge-neutral">Jury</span>
                        {/if}
                    </div>

                    {#if ballot.category.description}
                        <p class="m-0 text-xs leading-snug text-ink-2">
                            {ballot.category.description}
                        </p>
                    {/if}

                    {#if ballot.category.method === 'points'}
                        {@const used = spent(ballot.entries)}
                        <p
                            class="m-0 text-xs {used > ballot.category.maxPoints
                                ? 'text-danger-ink'
                                : 'text-ink-3'}"
                        >
                            {used} of {ballot.category.maxPoints} points used{used >
                            ballot.category.maxPoints
                                ? ' — over budget'
                                : ''}
                        </p>

                        <!-- TODO(backend: vote-points-immutable) — delete this
                             once a points vote can be changed. `SubmitVote`
                             returns an existing (category, voter, submission)
                             vote untouched (`vote_service.go:598-607`) and there
                             is no EditVote or DeleteVote, so re-scoring an entry
                             is silently ignored. Said out loud rather than left
                             for someone to discover: the alternative is a button
                             that reports success and changes nothing. -->
                        {#if alreadyVoted(ballot.category.id)}
                            <p class="m-0 text-xs text-warning-ink">
                                Points you have already given cannot be changed or taken
                                back yet — only entries you have not scored will be
                                recorded.
                            </p>
                        {/if}
                    {/if}

                    <ul class="m-0 flex list-none flex-col gap-2 p-0">
                        {#each ballot.entries as entry (entry.submission.id)}
                            <li class="flex items-start gap-3">
                                {#if ballot.category.method === 'single_choice'}
                                    <label class="flex flex-1 items-start gap-2">
                                        <input
                                            type="radio"
                                            name="submissionId"
                                            value={entry.submission.id}
                                            bind:group={ballot.choice}
                                            class="mt-1 shrink-0"
                                        />
                                        <span class="flex flex-col gap-0.5">
                                            <span class="text-sm text-ink">
                                                {entry.submission.projectTitle}
                                            </span>
                                            <span class="text-xs text-ink-3">
                                                {entry.submission.teamName}
                                            </span>
                                        </span>
                                    </label>
                                {:else}
                                    <!-- Paired hidden field: the action reads the ids
                                         from `submissionId` and each score from
                                         `points:<id>`, so a row with no score still
                                         announces itself and is dropped server-side
                                         rather than silently misaligning the two lists. -->
                                    <input
                                        type="hidden"
                                        name="submissionId"
                                        value={entry.submission.id}
                                    />
                                    <label class="flex flex-1 items-start gap-2">
                                        <input
                                            type="number"
                                            name={`points:${entry.submission.id}`}
                                            min="0"
                                            max={ballot.category.maxPoints}
                                            bind:value={entry.points}
                                            class="field w-20 shrink-0"
                                        />
                                        <span class="flex flex-col gap-0.5">
                                            <span class="text-sm text-ink">
                                                {entry.submission.projectTitle}
                                            </span>
                                            <span class="text-xs text-ink-3">
                                                {entry.submission.teamName}
                                            </span>
                                        </span>
                                    </label>
                                {/if}

                                <!-- Outside the label on purpose: a link inside
                                     one is activated by the label's own click
                                     handling, so tapping it would also pick the
                                     radio. Note it navigates away — a ballot
                                     opens seeded from votes already cast, so
                                     points typed but not yet submitted are lost.
                                     Submit first, then look. -->
                                <a
                                    href={resolve(
                                        `/my/hackathon/${data.hackathonId}/teams/${entry.submission.teamId}`
                                    )}
                                    class="shrink-0 whitespace-nowrap pt-1 text-xs font-semibold
                                           text-accent-ink no-underline hover:underline"
                                >
                                    View entry
                                </a>
                            </li>
                        {/each}
                    </ul>

                    {#if ownTeam.length > 0}
                        <p class="m-0 text-xs text-ink-3">
                            Not listed: {ownTeam
                                .map((s: Submission) => s.projectTitle)
                                .join(', ')} — you cannot vote for your own team.
                        </p>
                    {/if}

                    <div>
                        <button type="submit" class="btn btn-sm btn-solid">
                            {alreadyVoted(ballot.category.id) ? 'Change my vote' : 'Submit vote'}
                        </button>
                    </div>
                </form>
            </section>
        {/each}
    {/if}
</div>
