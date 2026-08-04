<script lang="ts">
    import { enhance } from '$app/forms';

    const { data, form } = $props();

    let starting = $state<string | null>(null);
    let editing = $state<string | null>(null);
    let finalizing = $state<string | null>(null);

    let nextRowId = 0;
    // Keyed by team, so opening a second team's form does not inherit the
    // answers typed into the first.
    let answerRows = $state<Record<string, { id: number; key: string }[]>>({});

    const myTeams = $derived(data.teams.filter((t) => t.isMine));
    const otherTeams = $derived(data.teams.filter((t) => !t.isMine));

    function rowsFor(teamId: string) {
        return answerRows[teamId] ?? [];
    }

    function addAnswerRow(teamId: string) {
        answerRows = { ...answerRows, [teamId]: [...rowsFor(teamId), { id: nextRowId++, key: '' }] };
    }

    function removeAnswerRow(teamId: string, id: number) {
        answerRows = { ...answerRows, [teamId]: rowsFor(teamId).filter((r) => r.id !== id) };
    }

    function fmt(d: Date | string | null | undefined): string {
        if (!d) return '';
        return new Date(d).toLocaleString('en-CH', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * CapabilityState: COMING=1, OPEN=2, CLOSED=3, UNGOVERNED=4. The dates are
     * display-only — `state` is what the server enforces.
     */
    const gateNote = $derived(
        (() => {
            const g = data.submissionsGate;
            if (g.state === 1)
                return g.opensAt ? `Submissions open ${fmt(g.opensAt)}.` : 'Submissions are not open yet.';
            if (g.state === 3)
                return g.closesAt ? `Submissions closed ${fmt(g.closesAt)}.` : 'Submissions are closed.';
            if (g.state === 2 && g.closesAt) return `Submissions close ${fmt(g.closesAt)}.`;
            return '';
        })()
    );

    // Organizers bypass the capability gate server-side, so hiding the controls
    // from them would hide a door that does open.
    const canWrite = $derived(data.isOrganizer || data.submissionsGate.open);

    /** Drafts are what an edit or a finalize can still act on. */
    function draftOf(submissions: { id: string; status: number }[]) {
        return submissions.find((s) => s.status === 1) ?? null;
    }
</script>

<div class="flex flex-col gap-6 p-4 sm:p-6">
    <div>
        <h1 class="text-2xl font-bold">Submissions</h1>
        <p class="text-sm text-surface-500">
            What each team turned in. Only a team's own members can write its submission.
        </p>
    </div>

    {#if form?.message}
        <p class="text-sm text-error-500">{form.message}</p>
    {/if}

    {#if !data.submissionsGate.open}
        <p class="card preset-tonal-warning p-3 text-sm">
            {gateNote || 'Submissions are closed.'}
            {#if data.isOrganizer}
                You can still write — organizers are not held to the window.
            {:else}
                This is a deadline, not a permission problem.
            {/if}
        </p>
    {:else if gateNote}
        <p class="text-sm text-surface-500">{gateNote}</p>
    {/if}

    <!-- ── Your teams ───────────────────────────────────────────── -->
    <section class="flex flex-col gap-3">
        <h2 class="text-xl font-bold">Your teams</h2>

        {#if myTeams.length === 0}
            <p class="text-sm text-surface-500">
                You aren't in a team yet, so there is nothing for you to turn in.
            </p>
        {/if}

        {#each myTeams as t (t.id)}
            {@const draft = draftOf(t.submissions)}
            <div class="card preset-outlined-surface-200-800 flex flex-col gap-3 p-4">
                <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                        <h3 class="font-semibold break-words">{t.name}</h3>
                        {#if t.projectTitle}
                            <p class="text-sm text-surface-500">{t.projectTitle}</p>
                        {/if}
                    </div>
                    {#if canWrite && !draft}
                        <button
                            class="btn btn-sm preset-filled-primary-500 shrink-0"
                            onclick={() => (starting = starting === t.id ? null : t.id)}
                        >
                            {starting === t.id ? 'Cancel' : 'Start a submission'}
                        </button>
                    {/if}
                </div>

                {#if starting === t.id}
                    <form
                        method="POST"
                        action="?/create"
                        use:enhance={() => async ({ update }) => {
                            await update();
                            starting = null;
                        }}
                        class="flex flex-col gap-3 border-t border-surface-200-800 pt-3"
                    >
                        <input type="hidden" name="teamId" value={t.id} />
                        <input type="hidden" name="projectId" value={t.projectId} />
                        <label>
                            <span class="text-sm">What you built (links, notes, anything)</span>
                            <textarea name="result" class="textarea min-h-32" rows="6"></textarea>
                        </label>

                        <div class="flex flex-col gap-2">
                            <p class="text-sm">
                                Answers your organizer asked for
                                <span class="text-surface-500"
                                    >— use the exact field names from the submission form.</span
                                >
                            </p>
                            {#each rowsFor(t.id) as row (row.id)}
                                <div class="flex flex-wrap items-center gap-2">
                                    <input
                                        name="answerKey"
                                        class="input min-w-0 flex-1"
                                        placeholder="field name"
                                    />
                                    <input
                                        name="answerValue"
                                        class="input min-w-0 flex-1"
                                        placeholder="answer"
                                    />
                                    <button
                                        type="button"
                                        class="btn btn-sm preset-tonal-error"
                                        onclick={() => removeAnswerRow(t.id, row.id)}
                                    >
                                        Remove
                                    </button>
                                </div>
                            {/each}
                            <div>
                                <button
                                    type="button"
                                    class="btn btn-sm preset-tonal"
                                    onclick={() => addAnswerRow(t.id)}
                                >
                                    Add an answer
                                </button>
                            </div>
                        </div>

                        <div>
                            <button class="btn btn-sm preset-filled-primary-500">
                                Save as draft
                            </button>
                        </div>
                    </form>
                {/if}

                {#if t.submissions.length === 0}
                    <p class="text-sm text-surface-500">Nothing turned in yet.</p>
                {/if}

                {#each t.submissions as s (s.id)}
                    <div class="flex flex-col gap-2 border-t border-surface-200-800 pt-3">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <span class="flex flex-wrap items-center gap-2">
                                <span class="font-semibold">Version {s.version}</span>
                                <span class="badge {s.statusPreset} text-sm">{s.statusLabel}</span>
                                {#if s.modifiedAt}
                                    <span class="text-sm text-surface-500">{fmt(s.modifiedAt)}</span>
                                {/if}
                            </span>
                            {#if canWrite && s.status === 1}
                                <div class="flex shrink-0 flex-wrap gap-2">
                                    <button
                                        class="btn btn-sm preset-tonal-primary"
                                        onclick={() => (editing = editing === s.id ? null : s.id)}
                                    >
                                        {editing === s.id ? 'Close' : 'Edit'}
                                    </button>
                                    <button
                                        class="btn btn-sm preset-tonal-error"
                                        onclick={() =>
                                            (finalizing = finalizing === s.id ? null : s.id)}
                                    >
                                        Finalize
                                    </button>
                                </div>
                            {/if}
                        </div>

                        {#if s.result}
                            <p class="text-sm break-words whitespace-pre-wrap text-surface-600-400">
                                {s.result}
                            </p>
                        {/if}

                        {#if editing === s.id}
                            <form
                                method="POST"
                                action="?/edit"
                                use:enhance={() => async ({ update }) => {
                                    await update();
                                    editing = null;
                                }}
                                class="flex flex-col gap-3"
                            >
                                <input type="hidden" name="submissionId" value={s.id} />
                                <label>
                                    <span class="text-sm">What you built</span>
                                    <textarea name="result" class="textarea min-h-32" rows="6"
                                        >{s.result}</textarea
                                    >
                                </label>
                                <div>
                                    <button class="btn btn-sm preset-filled-primary-500">
                                        Save draft
                                    </button>
                                </div>
                            </form>
                        {/if}

                        {#if finalizing === s.id}
                            <div class="card preset-tonal-error flex flex-col gap-2 p-3">
                                <p class="text-sm">
                                    Finalizing turns this in for judging and freezes it. You cannot
                                    edit it afterwards and you cannot undo this.
                                </p>
                                <form method="POST" action="?/finalize" use:enhance={() => async ({ update }) => {
                                    await update();
                                    finalizing = null;
                                }}>
                                    <input type="hidden" name="submissionId" value={s.id} />
                                    <button class="btn btn-sm preset-filled-error-500">
                                        Yes, finalize version {s.version}
                                    </button>
                                </form>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {/each}
    </section>

    <!-- ── Everyone else ────────────────────────────────────────── -->
    {#if otherTeams.length > 0}
        <section class="flex flex-col gap-3">
            <h2 class="text-xl font-bold">Other teams</h2>
            <div class="grid gap-4 md:grid-cols-2">
                {#each otherTeams as t (t.id)}
                    {@const latest = t.submissions[0]}
                    <div class="card preset-outlined-surface-200-800 flex flex-col gap-2 p-4">
                        <div class="flex flex-wrap items-start justify-between gap-2">
                            <h3 class="min-w-0 font-semibold break-words">{t.name}</h3>
                            {#if latest}
                                <span class="badge {latest.statusPreset} shrink-0 text-sm">
                                    {latest.statusLabel}
                                </span>
                            {/if}
                        </div>
                        {#if t.projectTitle}
                            <p class="text-sm text-surface-500">{t.projectTitle}</p>
                        {/if}
                        {#if !latest}
                            <p class="text-sm text-surface-500">Nothing turned in yet.</p>
                        {:else if latest.result}
                            <p class="text-sm break-words whitespace-pre-wrap text-surface-600-400">
                                {latest.result}
                            </p>
                        {/if}
                    </div>
                {/each}
            </div>
        </section>
    {/if}
</div>
