<script lang="ts">
    import { page as appPage } from '$app/stores';
    import { enhance } from '$app/forms';

    const { data, form } = $props();

    const hackathonId = $derived($appPage.params.id);

    let proposing = $state(false);
    let editing = $state<string | null>(null);

    const mine = $derived(data.proposals.filter((p) => p.isMine));

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
     * display-only — `state` is what the server enforces — so the sentence
     * never claims more than the gate does.
     */
    function gateNote(
        gate: { open: boolean; state: number; opensAt: Date | null; closesAt: Date | null },
        noun: string
    ): string {
        if (gate.state === 1)
            return gate.opensAt
                ? `${noun} open ${fmt(gate.opensAt)}.`
                : `${noun} are not open yet.`;
        if (gate.state === 3)
            return gate.closesAt
                ? `${noun} closed ${fmt(gate.closesAt)}.`
                : `${noun} are closed.`;
        if (gate.state === 2 && gate.closesAt) return `${noun} close ${fmt(gate.closesAt)}.`;
        return '';
    }

    const proposalsNote = $derived(gateNote(data.proposalsGate, 'Proposals'));
    const preferencesNote = $derived(gateNote(data.preferencesGate, 'Preferences'));

    // Organizers bypass the capability gate server-side, so hiding the form
    // from them would hide a door that does open.
    const canPropose = $derived(data.isOrganizer || data.proposalsGate.open);
    const canPrefer = $derived(data.isOrganizer || data.preferencesGate.open);
</script>

<div class="flex flex-col gap-6 p-4 sm:p-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
            <h1 class="text-2xl font-bold">Proposals</h1>
            <p class="text-sm text-surface-500">
                Ideas anyone on the roster can put forward. Organizers approve the ones
                that become projects to build.
            </p>
        </div>
        {#if canPropose}
            <button
                class="btn btn-sm preset-filled-primary-500 shrink-0"
                onclick={() => (proposing = !proposing)}
            >
                {proposing ? 'Cancel' : 'Propose a project'}
            </button>
        {/if}
    </div>

    {#if form?.message}
        <p class="text-sm text-error-500">{form.message}</p>
    {/if}

    {#if !data.proposalsGate.open}
        <p class="card preset-tonal-warning p-3 text-sm">
            {proposalsNote || 'Proposals are closed.'}
            {#if data.isOrganizer}
                You can still propose — organizers are not held to the window.
            {:else}
                This is a deadline, not a permission problem.
            {/if}
        </p>
    {:else if proposalsNote}
        <p class="text-sm text-surface-500">{proposalsNote}</p>
    {/if}

    {#if proposing}
        <form
            method="POST"
            action="?/propose"
            use:enhance={() => async ({ update }) => {
                await update();
                proposing = false;
            }}
            class="card preset-outlined-surface-200-800 flex flex-col gap-3 p-4"
        >
            <label>
                <span class="text-sm">Title</span>
                <input name="title" class="input" required minlength="3" maxlength="255" />
            </label>
            <label>
                <span class="text-sm">What is the idea?</span>
                <textarea name="description" class="textarea min-h-32" rows="6" maxlength="10000"
                ></textarea>
            </label>
            {#if data.tracks.length > 0}
                <label>
                    <span class="text-sm">Track (optional)</span>
                    <select name="trackId" class="select">
                        <option value="">No track</option>
                        {#each data.tracks as t (t.id)}
                            <option value={t.id}>{t.name}</option>
                        {/each}
                    </select>
                </label>
            {/if}
            <label>
                <span class="text-sm">Image URL (optional)</span>
                <input name="image" class="input" maxlength="5000" />
            </label>
            <div><button class="btn btn-sm preset-filled-primary-500">Propose project</button></div>
        </form>
    {/if}

    {#if !data.preferencesGate.open}
        <p class="card preset-tonal-warning p-3 text-sm">
            {preferencesNote || 'Preferences are closed.'}
            {#if !data.isOrganizer}
                This is a deadline, not a permission problem.
            {/if}
        </p>
    {:else if preferencesNote}
        <p class="text-sm text-surface-500">{preferencesNote}</p>
    {/if}

    {#if mine.length > 0}
        <p class="text-sm text-surface-500">
            {mine.length} of these {mine.length === 1 ? 'is' : 'are'} yours.
        </p>
    {/if}

    {#if data.proposals.length === 0}
        <p class="text-surface-500">No proposals yet.</p>
    {:else}
        <div class="grid gap-4 md:grid-cols-2">
            {#each data.proposals as p (p.id)}
                <div class="card preset-outlined-surface-200-800 flex flex-col gap-3 p-4">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                        <h2 class="min-w-0 text-lg font-semibold break-words">{p.title}</h2>
                        <span class="badge {p.statusPreset} shrink-0 text-sm">{p.statusLabel}</span>
                    </div>

                    <div class="flex flex-wrap items-center gap-2 text-sm text-surface-500">
                        {#if p.trackName}<span class="badge preset-tonal">{p.trackName}</span>{/if}
                        {#if p.isMine}<span class="badge preset-tonal-primary">Yours</span>{/if}
                        {#if p.preferenceCount !== null}
                            <span
                                >{p.preferenceCount}
                                {p.preferenceCount === 1 ? 'person wants' : 'people want'} in</span
                            >
                        {/if}
                    </div>

                    {#if p.description}
                        <p class="text-sm break-words text-surface-600-400">{p.description}</p>
                    {/if}

                    <div class="flex flex-wrap gap-2">
                        {#if canPrefer}
                            <form method="POST" action="?/prefer" use:enhance>
                                <input type="hidden" name="projectId" value={p.id} />
                                <button class="btn btn-sm {p.preferred ? 'preset-tonal-success' : 'preset-tonal-primary'}">
                                    {p.preferred ? "You're in" : 'I want to work on this'}
                                </button>
                            </form>
                        {/if}

                        {#if p.isMine || data.isOrganizer}
                            <button
                                class="btn btn-sm preset-tonal"
                                onclick={() => (editing = editing === p.id ? null : p.id)}
                            >
                                {editing === p.id ? 'Close' : 'Edit'}
                            </button>
                            <form method="POST" action="?/delete" use:enhance>
                                <input type="hidden" name="projectId" value={p.id} />
                                <button class="btn btn-sm preset-tonal-error">Delete</button>
                            </form>
                        {/if}

                        {#if data.isOrganizer}
                            {#if p.status === 2}
                                <form method="POST" action="?/disapprove" use:enhance>
                                    <input type="hidden" name="projectId" value={p.id} />
                                    <button class="btn btn-sm preset-tonal-warning"
                                        >Send back to proposed</button
                                    >
                                </form>
                            {:else}
                                <form method="POST" action="?/approve" use:enhance>
                                    <input type="hidden" name="projectId" value={p.id} />
                                    <button class="btn btn-sm preset-filled-primary-500"
                                        >Approve</button
                                    >
                                </form>
                            {/if}
                        {/if}
                    </div>

                    {#if editing === p.id}
                        <form
                            method="POST"
                            action="?/edit"
                            use:enhance={() => async ({ update }) => {
                                await update();
                                editing = null;
                            }}
                            class="flex flex-col gap-3 border-t border-surface-200-800 pt-3"
                        >
                            <input type="hidden" name="projectId" value={p.id} />
                            <label>
                                <span class="text-sm">Title</span>
                                <input
                                    name="title"
                                    class="input"
                                    value={p.title}
                                    required
                                    minlength="3"
                                    maxlength="255"
                                />
                            </label>
                            <label>
                                <span class="text-sm">What is the idea?</span>
                                <textarea name="description" class="textarea min-h-32" rows="6"
                                    >{p.description}</textarea
                                >
                            </label>
                            {#if data.tracks.length > 0}
                                <label>
                                    <span class="text-sm">Track</span>
                                    <select name="trackId" class="select">
                                        <option value="" selected={!p.trackId}>No track</option>
                                        {#each data.tracks as t (t.id)}
                                            <option value={t.id} selected={t.id === p.trackId}
                                                >{t.name}</option
                                            >
                                        {/each}
                                    </select>
                                </label>
                            {/if}
                            <label>
                                <span class="text-sm">Image URL</span>
                                <input name="image" class="input" value={p.image} maxlength="5000" />
                            </label>
                            <div>
                                <button class="btn btn-sm preset-filled-primary-500"
                                    >Save changes</button
                                >
                            </div>
                        </form>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}

    {#if data.canExport}
        <section class="flex flex-col gap-2">
            <h2 class="text-xl font-bold">Preferences</h2>
            <p class="text-sm text-surface-500">
                Who wants to work on what, as a spreadsheet you can sort teams from.
            </p>
            <div>
                <a
                    href="/my/hackathon/{hackathonId}/proposals/export"
                    class="btn btn-sm preset-tonal-primary"
                    download
                >
                    Download preferences (CSV)
                </a>
            </div>
        </section>
    {/if}
</div>
