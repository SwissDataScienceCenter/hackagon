<script lang="ts">
    import { enhance } from '$app/forms';
    import type { SubmitFunction } from '@sveltejs/kit';
    import BallotCard from '$lib/components/vote/BallotCard.svelte';
    import ResultsList from '$lib/components/vote/ResultsList.svelte';
    import ExportPanel from '$lib/components/vote/ExportPanel.svelte';

    const { data, form } = $props();

    // VotingMethod: SINGLE_CHOICE=1, RANKED=2, POINTS=3. A category may be
    // defined with any of them, but SubmitVote only stores single-choice
    // ballots — one Vote row per (category, voter) cannot hold a ranking.
    const METHODS = [
        { value: 1, label: 'Single choice' },
        { value: 2, label: 'Ranked (not castable yet)' },
        { value: 3, label: 'Points (not castable yet)' }
    ];

    // VoterType: ALL_PARTICIPANTS=1, JURY=2
    const VOTER_TYPES = [
        { value: 1, label: 'All participants' },
        { value: 2, label: 'Jury only' }
    ];

    let creatingCategory = $state(false);
    let editingCategory = $state<string | null>(null);
    let addingResult = $state<string | null>(null);
    let editingResult = $state<string | null>(null);

    /** Panels driven by local state must not be wiped by a form reset. */
    const keepValues: SubmitFunction = () => async ({ update }) => update({ reset: false });

    function closeAfter(reset: () => void): SubmitFunction {
        return () =>
            async ({ update }) => {
                await update();
                reset();
            };
    }
</script>

<div class="flex flex-col gap-8 p-4 sm:p-6">
    <header class="flex flex-col gap-1">
        <h1 class="text-2xl font-bold">Voting</h1>
        <p class="text-sm text-surface-500">
            One ballot per category, cast by the people in the room. The results below are
            what the organizers publish from the tally.
        </p>
    </header>

    {#if form?.message}
        <p class="text-sm text-error-500">{form.message}</p>
    {:else if form?.done}
        <p class="text-sm text-success-500">{form.done}</p>
    {/if}

    {#if !data.serviceAvailable}
        <p class="card preset-outlined-surface-200-800 p-4 text-sm text-surface-500">
            This server does not run the voting service yet.
        </p>
    {:else}
        <p
            class="card p-3 text-sm {data.votingOpen
                ? 'preset-tonal-success'
                : 'preset-tonal-surface'}"
        >
            {#if data.votingOpen}
                Voting is open — ballots are being accepted.
            {:else}
                Voting is not open. Ballots are refused until the organizers open it.
            {/if}
        </p>

        {#if data.isOrganizer}
            <!--
              Organizers and admins are deliberately given no ballot: SubmitVote
              answers them with PermissionDenied ("organizers do not vote") so
              that whoever runs the event does not also decide it.
            -->
            <p class="card preset-outlined-warning-500 p-4 text-sm">
                <span class="font-semibold">You run this event, so you do not vote in it.</span>
                <span class="block text-surface-500">
                    Ballots from organizers and admins are refused by the server. Shape the
                    categories here, watch the tally come in, then publish the placements.
                </span>
            </p>

            {#if form?.exported}
                <ExportPanel
                    title={form.exported.title}
                    filename={form.exported.filename}
                    text={form.exported.text}
                />
            {/if}

            <section class="flex flex-col gap-3">
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 class="text-xl font-bold">Categories</h2>
                        <p class="text-sm text-surface-500">
                            Each one collects a separate ballot from every voter.
                        </p>
                    </div>
                    <button
                        class="btn btn-sm preset-filled-primary-500"
                        onclick={() => (creatingCategory = !creatingCategory)}
                    >
                        {creatingCategory ? 'Cancel' : 'New category'}
                    </button>
                </div>

                {#if creatingCategory}
                    <form
                        method="POST"
                        action="?/createCategory"
                        use:enhance={closeAfter(() => (creatingCategory = false))}
                        class="card preset-outlined-surface-200-800 flex flex-col gap-3 p-4"
                    >
                        <label>
                            <span class="text-sm">Name</span>
                            <input name="name" class="input" required minlength="3" />
                        </label>
                        <label>
                            <span class="text-sm">What is being judged</span>
                            <textarea name="description" class="textarea" rows="2"></textarea>
                        </label>
                        <div class="grid gap-3 sm:grid-cols-2">
                            <label>
                                <span class="text-sm">Method</span>
                                <select name="votingMethod" class="select">
                                    {#each METHODS as m (m.value)}
                                        <option value={m.value}>{m.label}</option>
                                    {/each}
                                </select>
                            </label>
                            <label>
                                <span class="text-sm">Who votes</span>
                                <select name="voterType" class="select">
                                    {#each VOTER_TYPES as v (v.value)}
                                        <option value={v.value}>{v.label}</option>
                                    {/each}
                                </select>
                            </label>
                        </div>
                        <label>
                            <span class="text-sm">Jury (only used by jury categories)</span>
                            <select name="juryMemberIds" class="select" multiple size="4">
                                {#each data.members as member (member.id)}
                                    <option value={member.id}>{member.name}</option>
                                {/each}
                            </select>
                        </label>
                        <div>
                            <button class="btn btn-sm preset-filled-primary-500">
                                Create category
                            </button>
                        </div>
                    </form>
                {/if}

                {#each data.categories as c (c.id)}
                    <div class="card preset-outlined-surface-200-800 flex flex-col gap-4 p-4">
                        <div class="flex flex-wrap items-start justify-between gap-3">
                            <div class="min-w-0">
                                <div class="flex flex-wrap items-center gap-2">
                                    <span class="font-semibold">{c.name}</span>
                                    <span class="badge preset-tonal">{c.methodLabel}</span>
                                    <span class="badge preset-tonal-surface">{c.voterTypeLabel}</span>
                                </div>
                                {#if c.description}
                                    <p class="mt-1 text-sm text-surface-500">{c.description}</p>
                                {/if}
                                {#if c.isJuryOnly && c.juryNames.length > 0}
                                    <p class="mt-1 text-xs text-surface-500">
                                        Jury: {c.juryNames.join(', ')}
                                    </p>
                                {/if}
                            </div>
                            <div class="flex shrink-0 flex-wrap gap-2">
                                <button
                                    class="btn btn-sm preset-tonal-primary"
                                    onclick={() =>
                                        (editingCategory = editingCategory === c.id ? null : c.id)}
                                >
                                    {editingCategory === c.id ? 'Close' : 'Edit'}
                                </button>
                                <form method="POST" action="?/deleteCategory" use:enhance>
                                    <input type="hidden" name="categoryId" value={c.id} />
                                    <button class="btn btn-sm preset-tonal-error">Delete</button>
                                </form>
                            </div>
                        </div>

                        {#if editingCategory === c.id}
                            <form
                                method="POST"
                                action="?/editCategory"
                                use:enhance={closeAfter(() => (editingCategory = null))}
                                class="flex flex-col gap-3 border-t border-surface-200-800 pt-4"
                            >
                                <input type="hidden" name="categoryId" value={c.id} />
                                <label>
                                    <span class="text-sm">Name</span>
                                    <input name="name" class="input" value={c.name} required minlength="3" />
                                </label>
                                <label>
                                    <span class="text-sm">What is being judged</span>
                                    <textarea name="description" class="textarea" rows="2">{c.description}</textarea>
                                </label>
                                <div class="grid gap-3 sm:grid-cols-2">
                                    <label>
                                        <span class="text-sm">Method</span>
                                        <select name="votingMethod" class="select">
                                            {#each METHODS as m (m.value)}
                                                <option value={m.value} selected={m.value === c.votingMethod}>
                                                    {m.label}
                                                </option>
                                            {/each}
                                        </select>
                                    </label>
                                    <label>
                                        <span class="text-sm">Who votes</span>
                                        <select name="voterType" class="select">
                                            {#each VOTER_TYPES as v (v.value)}
                                                <option value={v.value} selected={v.value === c.voterType}>
                                                    {v.label}
                                                </option>
                                            {/each}
                                        </select>
                                    </label>
                                </div>
                                <label>
                                    <span class="text-sm">Jury</span>
                                    <select name="juryMemberIds" class="select" multiple size="4">
                                        {#each data.members as member (member.id)}
                                            <option
                                                value={member.id}
                                                selected={c.juryMemberIds.includes(member.id)}
                                            >
                                                {member.name}
                                            </option>
                                        {/each}
                                    </select>
                                </label>
                                <p class="text-xs text-surface-500">
                                    Selecting nobody leaves the jury as it is — an empty list cannot
                                    be told apart from an untouched one on the wire.
                                </p>
                                <div>
                                    <button class="btn btn-sm preset-filled-primary-500">
                                        Save category
                                    </button>
                                </div>
                            </form>
                        {/if}

                        <div class="grid gap-4 md:grid-cols-2">
                            <div class="flex flex-col gap-2">
                                <h4 class="text-sm font-semibold">Tally</h4>
                                {#if c.tally.length === 0}
                                    <p class="text-sm text-surface-500">No ballots yet.</p>
                                {:else}
                                    <ul class="flex flex-col gap-1">
                                        {#each c.tally as t (t.submissionId)}
                                            <li class="flex items-start justify-between gap-3 text-sm">
                                                <span class="min-w-0 break-words">{t.label}</span>
                                                <span class="badge preset-tonal shrink-0">{t.votes}</span>
                                            </li>
                                        {/each}
                                    </ul>
                                {/if}
                            </div>

                            <div class="flex flex-col gap-2">
                                <div class="flex flex-wrap items-center justify-between gap-2">
                                    <h4 class="text-sm font-semibold">Placements</h4>
                                    <button
                                        class="btn btn-sm preset-tonal"
                                        onclick={() =>
                                            (addingResult = addingResult === c.id ? null : c.id)}
                                    >
                                        {addingResult === c.id ? 'Cancel' : 'Add'}
                                    </button>
                                </div>

                                {#if addingResult === c.id}
                                    <form
                                        method="POST"
                                        action="?/createResult"
                                        use:enhance={closeAfter(() => (addingResult = null))}
                                        class="flex flex-col gap-2 border-b border-surface-200-800 pb-3"
                                    >
                                        <input type="hidden" name="categoryId" value={c.id} />
                                        <label>
                                            <span class="text-xs">Submission</span>
                                            <select name="submissionId" class="select" required>
                                                <option value="">Pick one</option>
                                                {#each data.submissions as s (s.id)}
                                                    <option value={s.id}>{s.label}</option>
                                                {/each}
                                            </select>
                                        </label>
                                        <div class="grid gap-2 sm:grid-cols-2">
                                            <label>
                                                <span class="text-xs">Position</span>
                                                <input
                                                    name="position"
                                                    type="number"
                                                    min="1"
                                                    value="1"
                                                    class="input"
                                                />
                                            </label>
                                            <label>
                                                <span class="text-xs">Title</span>
                                                <input name="title" class="input" placeholder="Winner" />
                                            </label>
                                        </div>
                                        <div>
                                            <button class="btn btn-sm preset-filled-primary-500">
                                                Record placement
                                            </button>
                                        </div>
                                    </form>
                                {/if}

                                {#each c.results as r (r.id)}
                                    <div class="flex flex-col gap-2 border-b border-surface-200-800 pb-2">
                                        <div class="flex items-start justify-between gap-2">
                                            <span class="min-w-0">
                                                <span class="badge preset-tonal-primary">#{r.position}</span>
                                                <span class="break-words text-sm">{r.submissionLabel}</span>
                                                {#if r.title}
                                                    <span class="block text-xs text-surface-500">{r.title}</span>
                                                {/if}
                                            </span>
                                            <div class="flex shrink-0 gap-2">
                                                <button
                                                    class="btn btn-sm preset-tonal"
                                                    onclick={() =>
                                                        (editingResult =
                                                            editingResult === r.id ? null : r.id)}
                                                >
                                                    {editingResult === r.id ? 'Close' : 'Edit'}
                                                </button>
                                                <form method="POST" action="?/deleteResult" use:enhance>
                                                    <input type="hidden" name="resultId" value={r.id} />
                                                    <button class="btn btn-sm preset-tonal-error">
                                                        Remove
                                                    </button>
                                                </form>
                                            </div>
                                        </div>
                                        {#if editingResult === r.id}
                                            <form
                                                method="POST"
                                                action="?/editResult"
                                                use:enhance={closeAfter(() => (editingResult = null))}
                                                class="flex flex-col gap-2"
                                            >
                                                <input type="hidden" name="resultId" value={r.id} />
                                                <label>
                                                    <span class="text-xs">Submission</span>
                                                    <select name="submissionId" class="select">
                                                        {#each data.submissions as s (s.id)}
                                                            <option
                                                                value={s.id}
                                                                selected={s.id === r.submissionId}
                                                            >
                                                                {s.label}
                                                            </option>
                                                        {/each}
                                                    </select>
                                                </label>
                                                <div class="grid gap-2 sm:grid-cols-2">
                                                    <label>
                                                        <span class="text-xs">Position</span>
                                                        <input
                                                            name="position"
                                                            type="number"
                                                            min="1"
                                                            value={r.position}
                                                            class="input"
                                                        />
                                                    </label>
                                                    <label>
                                                        <span class="text-xs">Title</span>
                                                        <input name="title" class="input" value={r.title} />
                                                    </label>
                                                </div>
                                                <div>
                                                    <button class="btn btn-sm preset-filled-primary-500">
                                                        Save placement
                                                    </button>
                                                </div>
                                            </form>
                                        {/if}
                                    </div>
                                {:else}
                                    <p class="text-sm text-surface-500">Nothing published yet.</p>
                                {/each}
                            </div>
                        </div>

                        <div class="flex flex-wrap items-center gap-2 border-t border-surface-200-800 pt-3">
                            <span class="text-xs text-surface-500">Export</span>
                            {#each [{ action: 'exportVotes', label: 'Ballots' }, { action: 'exportResults', label: 'Results' }] as ex (ex.action)}
                                {#each ['json', 'csv'] as fmt (fmt)}
                                    <form method="POST" action="?/{ex.action}" use:enhance={keepValues}>
                                        <input type="hidden" name="categoryId" value={c.id} />
                                        <input type="hidden" name="categoryName" value={c.name} />
                                        <input type="hidden" name="format" value={fmt} />
                                        <button class="btn btn-sm preset-tonal">
                                            {ex.label} {fmt.toUpperCase()}
                                        </button>
                                    </form>
                                {/each}
                            {/each}
                        </div>
                    </div>
                {:else}
                    <p class="text-sm text-surface-500">
                        No categories yet. Add one before opening voting.
                    </p>
                {/each}
            </section>
        {:else}
            <section class="flex flex-col gap-3">
                <div>
                    <h2 class="text-xl font-bold">Your ballots</h2>
                    <p class="text-sm text-surface-500">
                        One vote per category, and it cannot be taken back.
                    </p>
                </div>

                {#each data.categories as c (c.id)}
                    <BallotCard
                        category={c}
                        submissions={data.submissions}
                        votingOpen={data.votingOpen}
                        isWaiting={data.isWaiting}
                        alreadyVoted={form?.alreadyVotedIn === c.id}
                        justCast={form?.castIn === c.id}
                    />
                {:else}
                    <p class="text-sm text-surface-500">
                        The organizers have not set up any vote categories yet.
                    </p>
                {/each}
            </section>

            <section class="flex flex-col gap-3">
                <h2 class="text-xl font-bold">Results</h2>
                {#each data.categories as c (c.id)}
                    <div class="card preset-outlined-surface-200-800 flex flex-col gap-2 p-4">
                        <h3 class="font-semibold">{c.name}</h3>
                        <ResultsList results={c.results} />
                    </div>
                {:else}
                    <p class="text-sm text-surface-500">Nothing to show yet.</p>
                {/each}
            </section>
        {/if}
    {/if}
</div>
