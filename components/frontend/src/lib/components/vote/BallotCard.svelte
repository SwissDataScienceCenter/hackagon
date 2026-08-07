<script lang="ts">
    import { enhance } from '$app/forms';

    let {
        category,
        submissions,
        votingOpen,
        isWaiting = false,
        alreadyVoted = false,
        justCast = false,
    }: {
        category: {
            id: string;
            name: string;
            description: string;
            /** VotingMethod: SINGLE_CHOICE=1, RANKED=2, POINTS=3. */
            votingMethod: number;
            /** Points budget, points categories only. */
            maxPoints: number;
            methodLabel: string;
            voterTypeLabel: string;
            isJuryOnly: boolean;
            juryNames: string[];
            /** The server confirmed a ballot from this account in this category. */
            myBallotCast: boolean;
            myVoteLabel: string;
        };
        submissions: { id: string; label: string; status: string }[];
        votingOpen: boolean;
        /** Registration still awaiting approval — the backend refuses the ballot. */
        isWaiting?: boolean;
        /** The server answered ALREADY_EXISTS for this category on the last try. */
        alreadyVoted?: boolean;
        justCast?: boolean;
    } = $props();

    const RANKED = 2;
    const POINTS = 3;

    const decided = $derived(category.myBallotCast || alreadyVoted || justCast);

    // One entry per submission, in the order they are rendered. Ranked starts
    // blank so nothing is pre-ranked on the voter's behalf; points starts at
    // zero because zero means "awarded nothing", which is a real answer.
    let ranks = $state<string[]>([]);
    let points = $state<number[]>([]);

    $effect(() => {
        if (ranks.length !== submissions.length) ranks = submissions.map(() => '');
        if (points.length !== submissions.length) points = submissions.map(() => 0);
    });

    const spent = $derived(points.reduce((total, p) => total + (Number(p) || 0), 0));
    const remaining = $derived(category.maxPoints - spent);
</script>

<section class="card flex flex-col gap-3 p-4">
    <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-lg font-semibold">{category.name}</h3>
            <span class="badge badge-neutral">{category.methodLabel}</span>
            <span class="badge badge-neutral">{category.voterTypeLabel}</span>
        </div>
        {#if category.description}
            <p class="text-sm text-ink-3">{category.description}</p>
        {/if}
    </div>

    {#if category.isJuryOnly}
        <p class="text-xs text-ink-3">
            Jury category — the server accepts ballots from the jury only{#if category.juryNames.length > 0}:
                {category.juryNames.join(', ')}{/if}.
        </p>
    {/if}

    {#if decided}
        <div class="badge-success rounded p-3 text-sm">
            {#if category.myVoteLabel}
                <p class="font-medium">Your ballot: {category.myVoteLabel}</p>
            {:else}
                <p class="font-medium">You have already voted in this category.</p>
                <p class="text-xs">
                    Only organizers may read ballots back, so the choice itself is not shown here.
                </p>
            {/if}
            <p class="mt-1 text-xs">One ballot per category — this one is final.</p>
        </div>
    {:else if submissions.length === 0}
        <p class="text-sm text-ink-3">
            No submissions to vote on yet. They appear once teams hand their work in.
        </p>
    {:else}
        {#if !votingOpen}
            <p class="badge-warning rounded p-3 text-sm">
                Voting is not open. The organizers open it when the judging round starts.
            </p>
        {/if}
        {#if isWaiting}
            <p class="badge-warning rounded p-3 text-sm">
                Your registration is still awaiting approval, so ballots from your account are
                not accepted yet.
            </p>
        {/if}

        <!--
          The submit button stays live whatever the banners above say: the
          backend owns the verdict, and a refused ballot comes back as a message
          rather than as a button that was never allowed to be pressed.
        -->
        <form
            method="POST"
            action="?/castBallot"
            use:enhance
            class="flex flex-col gap-3"
        >
            <input type="hidden" name="categoryId" value={category.id} />
            <input type="hidden" name="votingMethod" value={category.votingMethod} />

            {#if category.votingMethod === RANKED}
                <fieldset class="flex flex-col gap-2">
                    <legend class="text-sm font-medium">
                        Rank every submission, 1 first
                    </legend>
                    <p class="text-xs text-ink-3">
                        Use each number from 1 to {submissions.length} exactly once. The server
                        refuses a ballot with a gap or a repeat rather than guessing what you
                        meant.
                    </p>
                    {#each submissions as s, i (s.id)}
                        <label class="flex items-start gap-2">
                            <input type="hidden" name="submissionId" value={s.id} />
                            <input
                                type="number"
                                name="rank"
                                class="field w-20 shrink-0"
                                min="1"
                                max={submissions.length}
                                step="1"
                                required
                                aria-label="Rank for {s.label}"
                                bind:value={ranks[i]}
                            />
                            <span class="min-w-0">
                                <span class="block break-words text-sm font-medium">{s.label}</span>
                                <span class="block text-xs text-ink-3">{s.status}</span>
                            </span>
                        </label>
                    {/each}
                </fieldset>
            {:else if category.votingMethod === POINTS}
                <fieldset class="flex flex-col gap-2">
                    <legend class="text-sm font-medium">
                        Spread your points across the submissions
                    </legend>
                    <p
                        class="rounded p-2 text-sm {remaining < 0
                            ? 'badge-warning'
                            : 'badge-neutral'}"
                        aria-live="polite"
                    >
                        {#if remaining < 0}
                            {-remaining} points over the limit of {category.maxPoints} — the server
                            will refuse this ballot.
                        {:else}
                            {remaining} of {category.maxPoints} points remaining.
                        {/if}
                    </p>
                    {#each submissions as s, i (s.id)}
                        <label class="flex items-start gap-2">
                            <input type="hidden" name="submissionId" value={s.id} />
                            <input
                                type="number"
                                name="points"
                                class="field w-24 shrink-0"
                                min="0"
                                max={category.maxPoints}
                                step="1"
                                aria-label="Points for {s.label}"
                                bind:value={points[i]}
                            />
                            <span class="min-w-0">
                                <span class="block break-words text-sm font-medium">{s.label}</span>
                                <span class="block text-xs text-ink-3">{s.status}</span>
                            </span>
                        </label>
                    {/each}
                    <p class="text-xs text-ink-3">
                        Leave a submission at zero to award it nothing — only positive awards are
                        recorded.
                    </p>
                </fieldset>
            {:else}
                <fieldset class="flex flex-col gap-2">
                    <legend class="text-sm font-medium">Pick one submission</legend>
                    {#each submissions as s (s.id)}
                        <label class="flex items-start gap-2">
                            <input
                                type="radio"
                                name="submissionId"
                                value={s.id}
                                class="radio mt-1 shrink-0"
                                required
                            />
                            <span class="min-w-0">
                                <span class="block break-words text-sm font-medium">{s.label}</span>
                                <span class="block text-xs text-ink-3">{s.status}</span>
                            </span>
                        </label>
                    {/each}
                </fieldset>
            {/if}

            <div>
                <button class="btn btn-sm btn-accent">Cast ballot</button>
            </div>
        </form>
    {/if}
</section>
