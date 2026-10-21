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
    // Always blank: a ballot is only offered in a category the viewer has not
    // voted in yet, so there is nothing of theirs to seed it with.
    const ballots = $state(
        data.categories.map((category) => ({
            category,
            choice: '',
            entries: votable.map((submission: Submission) => ({
                submission,
                points: 0
            }))
        }))
    );

    function spent(entries: { points: number }[]): number {
        return entries.reduce((sum, e) => sum + (Number(e.points) || 0), 0);
    }

    // The viewer's cast vote in a category, in ballot order, for the read-only
    // view — empty if they have not voted there. Read from `data`, so it appears
    // as soon as a submit lands and the page data reloads.
    function myVote(categoryId: string): { submission: Submission; points: number }[] {
        const cast = data.myVotes[categoryId] ?? {};
        return votable.flatMap((s: Submission) => {
            const points = cast[s.id];
            return points === undefined ? [] : [{ submission: s, points }];
        });
    }

    // `bind:value` on a number input stores 5 for "0005" but never rewrites the
    // text, so the leading zeros stay on screen. Rewritten on change (commit,
    // not every keystroke) so the caret is not yanked mid-typing. An empty or
    // invalid field reads as NaN and is left for native validation to flag.
    function normalizeNumber(e: Event & { currentTarget: HTMLInputElement }) {
        const n = e.currentTarget.valueAsNumber;
        if (Number.isFinite(n)) e.currentTarget.value = String(n);
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

    <!-- Only a result that names no category lands up here; everything else is
         shown inside its own ballot, next to the button that was pressed. -->
    {#if form?.message && !form.categoryId}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {/if}

    {#if !data.canVote}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            {data.votingEnabled
                ? 'You need to be a confirmed participant of this hackathon to vote.'
                : 'Voting is not open right now.'}
        </p>
    <!-- Before the two emptier explanations below, both of which would be a
         guess here: a ballot is built from the hackathon's teams, so with
         assignments unpublished it cannot be built at all and "nothing to vote
         on yet" would blame the entrants for a switch nobody flipped. See the
         TODO in the load. -->
    {:else if !data.teamsPublished}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            Voting is open, but team assignments have not been published, so the ballot
            cannot be built. This opens with "See team assignments" in the hackathon's
            settings.
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
             inspect an entry is from the row you are about to vote for.

             TODO(backend: vote-points-immutable) — one vote per category, final
             once submitted, for every method. The backend cannot change a
             points or ranked vote (it keeps the stored one and ignores the
             resubmit), while single choice it can. Rather than a different rule
             per method, none is offered for change. Once a resubmit replaces the
             whole ballot, this can become "you can change your vote until
             voting closes", for all methods at once. -->
        <p class="m-0 text-xs text-ink-3">
            You vote once in each category, and your vote is final. Want to look before
            you vote? Open an entry to see the project and what it submitted.
        </p>

        {#each ballots as ballot (ballot.category.id)}
            {@const cast = myVote(ballot.category.id)}
            {@const used = spent(ballot.entries)}
            {@const overBy =
                ballot.category.method === 'points' ? used - ballot.category.maxPoints : 0}
            {@const result = form?.categoryId === ballot.category.id ? form : undefined}
            <section class="card card-raised box-border flex w-full flex-col gap-4 px-5 py-4">
                <div class="flex flex-wrap items-center gap-2">
                    <h3 class="m-0 text-sm leading-snug text-ink">{ballot.category.name}</h3>
                    <span class="badge badge-neutral">{ballot.category.methodLabel}</span>
                </div>

                {#if ballot.category.description}
                    <p class="m-0 text-xs leading-snug text-ink-2">
                        {ballot.category.description}
                    </p>
                {/if}

                {#if cast.length > 0}
                    <!-- Already voted: what was cast, read-only. -->
                    <p class="m-0 text-xs text-ink-2" role="status">
                        {ballot.category.method === 'points'
                            ? `You voted, giving ${spent(cast)} of ${ballot.category.maxPoints} points:`
                            : 'You voted for:'}
                    </p>
                    <ul class="m-0 flex list-none flex-col gap-2 p-0">
                        {#each cast as vote (vote.submission.id)}
                            <li class="flex items-start gap-3">
                                {#if ballot.category.method === 'points'}
                                    <span class="w-20 shrink-0 text-sm text-ink-2">
                                        {vote.points === 1 ? '1 point' : `${vote.points} points`}
                                    </span>
                                {/if}
                                <span class="flex flex-1 flex-col gap-0.5">
                                    <span class="text-sm text-ink">
                                        {vote.submission.projectTitle}
                                    </span>
                                    <span class="text-xs text-ink-3">
                                        {vote.submission.teamName}
                                    </span>
                                </span>
                                <a
                                    href={resolve(
                                        `/my/hackathon/${data.hackathonId}/teams/${vote.submission.teamId}`
                                    )}
                                    class="shrink-0 whitespace-nowrap text-xs font-semibold
                                           text-accent-ink no-underline hover:underline"
                                >
                                    View entry
                                </a>
                            </li>
                        {/each}
                    </ul>
                {:else if Object.keys(data.myVotes[ballot.category.id] ?? {}).length > 0}
                    <!-- Voted, but only for entries no longer on the ballot (a
                         team whose final submission has since changed). Still a
                         cast vote, so the form stays closed. -->
                    <p class="m-0 text-xs text-ink-2" role="status">
                        You have voted in this category.
                    </p>
                {:else}
                    <!-- reset: false, because the default enhance callback resets
                         the <form> on success, blanking it for the moment before
                         the reloaded data swaps it for the read-only vote. -->
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

                        {#if ballot.category.method === 'points'}
                            <p
                                class="m-0 text-xs {overBy > 0
                                    ? 'text-danger-ink'
                                    : 'text-ink-3'}"
                            >
                                {used} of {ballot.category.maxPoints} points used{overBy > 0
                                    ? ' — over budget'
                                    : ''}
                            </p>
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
                                        <!-- Paired hidden field: the action reads
                                             the ids from `submissionId` and each
                                             score from `points:<id>`, so a row with
                                             no score still announces itself and is
                                             dropped server-side rather than
                                             silently misaligning the two lists. -->
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
                                                onchange={normalizeNumber}
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

                                    <!-- Outside the label on purpose: a link
                                         inside one is activated by the label's
                                         own click handling, so tapping it would
                                         also pick the radio. Note it navigates
                                         away, so a ballot filled in but not yet
                                         submitted is lost. -->
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

                        <!-- Over budget, the button is disabled rather than left
                             to submit: per-field `max` only stops one entry above
                             the budget, never a total spread across several, so
                             nothing in the browser would catch it and the backend
                             refusal is a round trip for something already known
                             here. The reason sits beside the button so a disabled
                             control never goes unexplained. -->
                        <div class="flex flex-wrap items-center gap-3">
                            <button
                                type="submit"
                                class="btn btn-sm btn-solid"
                                disabled={overBy > 0}
                            >
                                Submit vote
                            </button>
                            {#if overBy > 0}
                                <p class="m-0 text-xs text-danger-ink">
                                    {overBy === 1 ? '1 point' : `${overBy} points`} over budget
                                    — take some back to submit.
                                </p>
                            {:else if result?.message}
                                <p class="m-0 text-xs text-danger-ink" role="alert">
                                    {result.message}
                                </p>
                            {:else}
                                <p class="m-0 text-xs text-ink-3">
                                    Your vote is final once submitted.
                                </p>
                            {/if}
                        </div>
                    </form>
                {/if}
            </section>
        {/each}
    {/if}
</div>
