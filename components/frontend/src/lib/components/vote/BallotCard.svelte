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
            methodLabel: string;
            voterTypeLabel: string;
            isJuryOnly: boolean;
            juryNames: string[];
            myVoteSubmissionId: string;
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

    const decided = $derived(Boolean(category.myVoteSubmissionId) || alreadyVoted || justCast);
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
            <div>
                <button class="btn btn-sm btn-accent">Cast ballot</button>
            </div>
        </form>
    {/if}
</section>
