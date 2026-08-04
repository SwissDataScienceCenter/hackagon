<script lang="ts">
    import { page as appPage } from '$app/stores';
    import { enhance } from '$app/forms';
    import type { SubmitFunction } from '@sveltejs/kit';
    import { membershipBadgeLabel, membershipBadgePreset } from '$lib/utils/hackathonStatus';

    const { data, form } = $props();

    const hackathonId = $derived($appPage.params.id);
    const origin = $derived($appPage.url.origin);

    // is_waiting is the waitlist flag; everyone on the roster holds the
    // Member role, so it is what separates "requested" from "confirmed".
    const waiting = $derived(data.members.filter((m) => m.isWaiting));
    const confirmed = $derived(data.members.filter((m) => !m.isWaiting));

    let editingPage = $state<string | null>(null);
    let creatingPage = $state(false);
    let copied = $state<string | null>(null);
    let editingPhase = $state<string | null>(null);
    let creatingPhase = $state(false);
    let editingTrack = $state<string | null>(null);
    let creatingTrack = $state(false);

    let nextRowId = 0;
    let prizeRows = $state([
        { id: nextRowId++, rank: 1, title: '' },
        { id: nextRowId++, rank: 2, title: '' },
        { id: nextRowId++, rank: 3, title: '' }
    ]);
    let awardRows = $state([{ id: nextRowId++, rank: 1, special: '', submissionId: '' }]);

    function inviteUrl(token: string): string {
        return `${origin}/invite/${token}`;
    }

    async function copy(token: string) {
        try {
            await navigator.clipboard.writeText(inviteUrl(token));
            copied = token;
            setTimeout(() => (copied = null), 2000);
        } catch {
            copied = null; // clipboard blocked; the link is selectable anyway
        }
    }

    function fmt(d: Date | string | null | undefined): string {
        if (!d) return '—';
        return new Date(d).toLocaleString('en-CH', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /** Date → the wall-clock string a datetime-local input expects. */
    function dtLocal(d: Date | string | null | undefined): string {
        if (!d) return '';
        const t = new Date(d);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
    }

    function withTimes(options: { reset?: boolean; after?: () => void } = {}): SubmitFunction {
        return ({ formElement, formData }) => {
            // A datetime-local field submits a wall-clock string with no zone, which
            // the server would otherwise read in its own timezone, not the organizer's.
            for (const el of formElement.querySelectorAll<HTMLInputElement>(
                'input[type="datetime-local"]'
            )) {
                if (el.name && el.value) formData.set(el.name, new Date(el.value).toISOString());
            }
            return async ({ update }) => {
                await update({ reset: options.reset ?? true });
                options.after?.();
            };
        };
    }

    // These forms are driven by local state, which a form reset would not restore.
    const keepValues: SubmitFunction = () => async ({ update }) => update({ reset: false });

    function addPrizeRow() {
        prizeRows = [...prizeRows, { id: nextRowId++, rank: prizeRows.length + 1, title: '' }];
    }

    function addAwardRow() {
        awardRows = [...awardRows, { id: nextRowId++, rank: awardRows.length + 1, special: '', submissionId: '' }];
    }
</script>

<div class="flex flex-col gap-8 p-4 sm:p-6">
    {#if form?.message}
        <p class="text-sm text-error-500">{form.message}</p>
    {/if}

    {#if !data.isOrganizer}
        <p class="text-surface-500">
            Only this event's organizers can manage it.
        </p>
    {:else}
        <!-- ── Participants ─────────────────────────────────────────── -->
        <section class="flex flex-col gap-3">
            <div>
                <h2 class="text-xl font-bold">Participants</h2>
                <p class="text-sm text-surface-500">
                    {confirmed.length} confirmed · {waiting.length} awaiting approval
                </p>
            </div>

            {#if waiting.length > 0}
                <div class="card preset-outlined-warning-500 p-4">
                    <h3 class="mb-3 font-semibold">Waiting for a decision</h3>
                    <div class="flex flex-col gap-2">
                        {#each waiting as m (m.user?.id)}
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <span>{m.user?.displayName || m.user?.username}</span>
                                <div class="flex gap-2">
                                    <form method="POST" action="?/approve" use:enhance>
                                        <input type="hidden" name="userId" value={m.user?.id} />
                                        <button class="btn btn-sm preset-filled-primary-500">Approve</button>
                                    </form>
                                    <form method="POST" action="?/remove" use:enhance>
                                        <input type="hidden" name="userId" value={m.user?.id} />
                                        <button class="btn btn-sm preset-tonal-error">Decline</button>
                                    </form>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            <div class="card preset-outlined-surface-200-800 overflow-x-auto p-4">
                <h3 class="mb-3 font-semibold">On the roster</h3>
                {#if confirmed.length === 0}
                    <p class="text-sm text-surface-500">Nobody confirmed yet.</p>
                {:else}
                    <div class="flex flex-col gap-2">
                        {#each confirmed as m (m.user?.id)}
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <span class="flex items-center gap-2">
                                    {m.user?.displayName || m.user?.username}
                                    <span class="badge {membershipBadgePreset(m.isWaiting)}">
                                        {membershipBadgeLabel(m.isWaiting, m.role)}
                                    </span>
                                </span>
                                <form method="POST" action="?/remove" use:enhance>
                                    <input type="hidden" name="userId" value={m.user?.id} />
                                    <button class="btn btn-sm preset-tonal-error">Remove</button>
                                </form>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </section>

        <!-- ── Invitation links ─────────────────────────────────────── -->
        <section class="flex flex-col gap-3">
            <div>
                <h2 class="text-xl font-bold">Invitation links</h2>
                <p class="text-sm text-surface-500">
                    Anyone with a link can see this event and request a place — you still
                    approve them above. Send links by email; revoke one if it spreads
                    further than you meant.
                </p>
            </div>

            <form method="POST" action="?/createInvite" use:enhance
                  class="card preset-outlined-surface-200-800 flex flex-wrap items-end gap-3 p-4">
                <label class="flex-1">
                    <span class="text-sm">Who is this for? (optional reminder)</span>
                    <input name="note" class="input" placeholder="Partner labs" />
                </label>
                <button class="btn preset-filled-primary-500">Generate link</button>
            </form>

            {#each data.invites as inv (inv.id)}
                <div class="card preset-outlined-surface-200-800 flex flex-wrap items-center justify-between gap-3 p-4">
                    <div class="min-w-0">
                        {#if inv.note}<p class="font-semibold">{inv.note}</p>{/if}
                        <code class="text-xs break-all">{inviteUrl(inv.token)}</code>
                    </div>
                    <div class="flex shrink-0 gap-2">
                        <button class="btn btn-sm preset-tonal" onclick={() => copy(inv.token)}>
                            {copied === inv.token ? 'Copied' : 'Copy'}
                        </button>
                        <form method="POST" action="?/revokeInvite" use:enhance>
                            <input type="hidden" name="inviteId" value={inv.id} />
                            <button class="btn btn-sm preset-tonal-error">Revoke</button>
                        </form>
                    </div>
                </div>
            {:else}
                <p class="text-sm text-surface-500">No links yet.</p>
            {/each}
        </section>

        <!-- ── Event pages ──────────────────────────────────────────── -->
        <section class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 class="text-xl font-bold">Event pages</h2>
                    <p class="text-sm text-surface-500">
                        News, schedules and wrap-up posts shown on this event's public page.
                        Content is markdown.
                    </p>
                </div>
                <button class="btn btn-sm preset-filled-primary-500"
                        onclick={() => (creatingPage = !creatingPage)}>
                    {creatingPage ? 'Cancel' : 'New page'}
                </button>
            </div>

            {#if creatingPage}
                <form method="POST" action="?/createPage"
                      use:enhance={() => async ({ update }) => { await update(); creatingPage = false; }}
                      class="card preset-outlined-surface-200-800 flex flex-col gap-3 p-4">
                    <label>
                        <span class="text-sm">Title</span>
                        <input name="title" class="input" required minlength="3" />
                    </label>
                    <label>
                        <span class="text-sm">Content (markdown)</span>
                        <textarea name="content" class="textarea min-h-40" rows="8"></textarea>
                    </label>
                    <label class="flex items-center gap-2">
                        <input name="visible" type="checkbox" class="checkbox" checked />
                        <span class="text-sm">Visible to participants</span>
                    </label>
                    <div><button class="btn btn-sm preset-filled-primary-500">Create page</button></div>
                </form>
            {/if}

            {#each data.pages as p (p.id)}
                <div class="card preset-outlined-surface-200-800 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <span class="flex items-center gap-2">
                            <span class="font-semibold">{p.title}</span>
                            <span class="badge {p.visible ? 'preset-tonal-success' : 'preset-tonal-warning'}">
                                {p.visible ? 'Visible' : 'Hidden'}
                            </span>
                        </span>
                        <div class="flex shrink-0 gap-2">
                            <button class="btn btn-sm preset-tonal-primary"
                                    onclick={() => (editingPage = editingPage === p.id ? null : p.id)}>
                                {editingPage === p.id ? 'Close' : 'Edit'}
                            </button>
                            <form method="POST" action="?/deletePage" use:enhance>
                                <input type="hidden" name="pageId" value={p.id} />
                                <button class="btn btn-sm preset-tonal-error">Delete</button>
                            </form>
                        </div>
                    </div>

                    {#if editingPage === p.id}
                        <form method="POST" action="?/editPage"
                              use:enhance={() => async ({ update }) => { await update(); editingPage = null; }}
                              class="mt-4 flex flex-col gap-3 border-t border-surface-200-800 pt-4">
                            <input type="hidden" name="pageId" value={p.id} />
                            <label>
                                <span class="text-sm">Title</span>
                                <input name="title" class="input" value={p.title} required minlength="3" />
                            </label>
                            <label>
                                <span class="text-sm">Content (markdown)</span>
                                <textarea name="content" class="textarea min-h-60" rows="12">{p.content}</textarea>
                            </label>
                            <label class="flex items-center gap-2">
                                <input name="visible" type="checkbox" class="checkbox" checked={p.visible} />
                                <span class="text-sm">Visible to participants</span>
                            </label>
                            <div class="flex flex-wrap gap-2">
                                <button class="btn btn-sm preset-filled-primary-500">Save changes</button>
                                <a href="/hackathon/{hackathonId}" class="btn btn-sm preset-tonal"
                                   target="_blank" rel="noopener">View public page</a>
                            </div>
                        </form>
                    {/if}
                </div>
            {:else}
                <p class="text-sm text-surface-500">No pages yet.</p>
            {/each}
        </section>

        <!-- ── Schedule ─────────────────────────────────────────────── -->
        <section class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 class="text-xl font-bold">Schedule</h2>
                    <p class="text-sm text-surface-500">
                        Phases are the shape of the event. Marking one current is what tells
                        everyone where the event actually is — dates alone go stale the
                        moment a day slips.
                    </p>
                </div>
                <button class="btn btn-sm preset-filled-primary-500"
                        onclick={() => (creatingPhase = !creatingPhase)}>
                    {creatingPhase ? 'Cancel' : 'New phase'}
                </button>
            </div>

            {#if creatingPhase}
                <form method="POST" action="?/createPhase"
                      use:enhance={withTimes({ after: () => (creatingPhase = false) })}
                      class="card preset-outlined-surface-200-800 flex flex-col gap-3 p-4">
                    <label>
                        <span class="text-sm">Name</span>
                        <input name="name" class="input" required minlength="3" />
                    </label>
                    <label>
                        <span class="text-sm">What happens in it</span>
                        <textarea name="description" class="textarea" rows="2" required></textarea>
                    </label>
                    <div class="grid gap-3 sm:grid-cols-2">
                        <label>
                            <span class="text-sm">Starts</span>
                            <input name="startsAt" type="datetime-local" class="input" />
                        </label>
                        <label>
                            <span class="text-sm">Ends</span>
                            <input name="endsAt" type="datetime-local" class="input" />
                        </label>
                    </div>
                    <p class="text-xs text-surface-500">Give both dates or neither.</p>
                    <div><button class="btn btn-sm preset-filled-primary-500">Create phase</button></div>
                </form>
            {/if}

            {#each data.phases as ph (ph.id)}
                <div class="card preset-outlined-surface-200-800 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <span class="flex flex-wrap items-center gap-2">
                            <span class="font-semibold">{ph.name}</span>
                            {#if data.currentPhaseId === ph.id}
                                <span class="badge preset-tonal-success">Current</span>
                            {/if}
                            <span class="text-sm text-surface-500">
                                {fmt(ph.startsAt)} – {fmt(ph.endsAt)}
                            </span>
                        </span>
                        <div class="flex shrink-0 flex-wrap gap-2">
                            {#if data.currentPhaseId !== ph.id}
                                <form method="POST" action="?/advancePhase" use:enhance>
                                    <input type="hidden" name="phaseId" value={ph.id} />
                                    <button class="btn btn-sm preset-tonal-primary">Mark current</button>
                                </form>
                            {/if}
                            <button class="btn btn-sm preset-tonal"
                                    onclick={() => (editingPhase = editingPhase === ph.id ? null : ph.id)}>
                                {editingPhase === ph.id ? 'Close' : 'Edit'}
                            </button>
                            <form method="POST" action="?/deletePhase" use:enhance>
                                <input type="hidden" name="phaseId" value={ph.id} />
                                <button class="btn btn-sm preset-tonal-error">Delete</button>
                            </form>
                        </div>
                    </div>

                    {#if editingPhase === ph.id}
                        <form method="POST" action="?/editPhase"
                              use:enhance={withTimes({ after: () => (editingPhase = null) })}
                              class="mt-4 flex flex-col gap-3 border-t border-surface-200-800 pt-4">
                            <input type="hidden" name="phaseId" value={ph.id} />
                            <label>
                                <span class="text-sm">Name</span>
                                <input name="name" class="input" value={ph.name} required minlength="3" />
                            </label>
                            <label>
                                <span class="text-sm">What happens in it</span>
                                <textarea name="description" class="textarea" rows="2">{ph.description ?? ''}</textarea>
                            </label>
                            <div class="grid gap-3 sm:grid-cols-2">
                                <label>
                                    <span class="text-sm">Starts</span>
                                    <input name="startsAt" type="datetime-local" class="input"
                                           value={dtLocal(ph.startsAt)} />
                                </label>
                                <label>
                                    <span class="text-sm">Ends</span>
                                    <input name="endsAt" type="datetime-local" class="input"
                                           value={dtLocal(ph.endsAt)} />
                                </label>
                            </div>
                            <label>
                                <span class="text-sm">Page to read during this phase</span>
                                <select name="pageId" class="select">
                                    <option value="">None</option>
                                    {#each data.pages as p (p.id)}
                                        <option value={p.id} selected={p.id === ph.pageId}>{p.title}</option>
                                    {/each}
                                </select>
                            </label>
                            <div><button class="btn btn-sm preset-filled-primary-500">Save phase</button></div>
                        </form>
                    {/if}
                </div>
            {:else}
                <p class="text-sm text-surface-500">No phases yet.</p>
            {/each}
        </section>

        <!-- ── Tracks ───────────────────────────────────────────────── -->
        <section class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 class="text-xl font-bold">Tracks</h2>
                    <p class="text-sm text-surface-500">
                        The themes projects can be proposed under.
                    </p>
                </div>
                <button class="btn btn-sm preset-filled-primary-500"
                        onclick={() => (creatingTrack = !creatingTrack)}>
                    {creatingTrack ? 'Cancel' : 'New track'}
                </button>
            </div>

            {#if creatingTrack}
                <form method="POST" action="?/createTrack"
                      use:enhance={() => async ({ update }) => { await update(); creatingTrack = false; }}
                      class="card preset-outlined-surface-200-800 flex flex-col gap-3 p-4">
                    <label>
                        <span class="text-sm">Name</span>
                        <input name="name" class="input" required minlength="3" />
                    </label>
                    <label>
                        <span class="text-sm">Description</span>
                        <textarea name="description" class="textarea" rows="3" required minlength="3"></textarea>
                    </label>
                    <div><button class="btn btn-sm preset-filled-primary-500">Create track</button></div>
                </form>
            {/if}

            {#each data.tracks as t (t.id)}
                <div class="card preset-outlined-surface-200-800 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <span class="font-semibold">{t.name}</span>
                        <div class="flex shrink-0 gap-2">
                            <button class="btn btn-sm preset-tonal-primary"
                                    onclick={() => (editingTrack = editingTrack === t.id ? null : t.id)}>
                                {editingTrack === t.id ? 'Close' : 'Edit'}
                            </button>
                            <form method="POST" action="?/deleteTrack" use:enhance>
                                <input type="hidden" name="trackId" value={t.id} />
                                <button class="btn btn-sm preset-tonal-error">Delete</button>
                            </form>
                        </div>
                    </div>
                    {#if editingTrack === t.id}
                        <form method="POST" action="?/editTrack"
                              use:enhance={() => async ({ update }) => { await update(); editingTrack = null; }}
                              class="mt-4 flex flex-col gap-3 border-t border-surface-200-800 pt-4">
                            <input type="hidden" name="trackId" value={t.id} />
                            <label>
                                <span class="text-sm">Name</span>
                                <input name="name" class="input" value={t.name} required minlength="3" />
                            </label>
                            <label>
                                <span class="text-sm">Description</span>
                                <textarea name="description" class="textarea" rows="3" required minlength="3">{t.description}</textarea>
                            </label>
                            <div><button class="btn btn-sm preset-filled-primary-500">Save track</button></div>
                        </form>
                    {:else if t.description}
                        <p class="mt-2 text-sm text-surface-500">{t.description}</p>
                    {/if}
                </div>
            {:else}
                <p class="text-sm text-surface-500">No tracks yet.</p>
            {/each}
        </section>

        <!-- ── Deadlines ────────────────────────────────────────────── -->
        <section class="flex flex-col gap-3">
            <div>
                <h2 class="text-xl font-bold">Deadlines</h2>
                <p class="text-sm text-surface-500">
                    The backend enforces these on registering, proposing, ranking and
                    submitting. A deadline left blank is not enforced at all.
                </p>
            </div>

            {#if form?.windows}
                <div class="card preset-outlined-success-500 p-4">
                    <h3 class="mb-2 font-semibold">Saved</h3>
                    <ul class="text-sm">
                        <li>Registration opens: {fmt(form.windows.registrationOpens)}</li>
                        <li>Registration closes: {fmt(form.windows.registrationCloses)}</li>
                        <li>Proposals close: {fmt(form.windows.proposalsClose)}</li>
                        <li>Preferences close: {fmt(form.windows.preferencesClose)}</li>
                        <li>Submissions close: {fmt(form.windows.submissionsClose)}</li>
                        {#if form.windows.registrationOverrideUntil}
                            <li>Registration held open until: {fmt(form.windows.registrationOverrideUntil)}</li>
                        {/if}
                        {#if form.windows.submissionsOverrideUntil}
                            <li>Submissions held open until: {fmt(form.windows.submissionsOverrideUntil)}</li>
                        {/if}
                    </ul>
                </div>
            {/if}

            <form method="POST" action="?/setWindows" use:enhance={withTimes({ reset: false })}
                  class="card preset-outlined-surface-200-800 flex flex-col gap-3 p-4">
                <div class="grid gap-3 sm:grid-cols-2">
                    <label>
                        <span class="text-sm">Registration opens</span>
                        <input name="registrationOpens" type="datetime-local" class="input" />
                    </label>
                    <label>
                        <span class="text-sm">Registration closes</span>
                        <input name="registrationCloses" type="datetime-local" class="input" />
                    </label>
                    <label>
                        <span class="text-sm">Proposals close</span>
                        <input name="proposalsClose" type="datetime-local" class="input" />
                    </label>
                    <label>
                        <span class="text-sm">Preferences close</span>
                        <input name="preferencesClose" type="datetime-local" class="input" />
                    </label>
                    <label>
                        <span class="text-sm">Submissions close</span>
                        <input name="submissionsClose" type="datetime-local" class="input" />
                    </label>
                    <label>
                        <span class="text-sm">Late policy (shown to participants)</span>
                        <input name="latePolicy" class="input" placeholder="Late demos judged, not ranked" />
                    </label>
                </div>
                <p class="text-xs text-surface-500">
                    Only the fields you fill in are written; the rest keep whatever they had.
                </p>
                <div><button class="btn btn-sm preset-filled-primary-500">Save deadlines</button></div>
            </form>

            <form method="POST" action="?/overrideWindow" use:enhance
                  class="card preset-outlined-warning-500 flex flex-col gap-3 p-4">
                <h3 class="font-semibold">Hold a window open</h3>
                <p class="text-sm text-surface-500">
                    For the walk-in at the door or the team whose laptop died. The extension
                    runs from the moment you grant it, not from the deadline it passed — 30
                    minutes means 30 minutes from now.
                </p>
                <div class="flex flex-wrap items-end gap-3">
                    <label class="min-w-40 flex-1">
                        <span class="text-sm">Window</span>
                        <select name="window" class="select">
                            <option value="registration">Registration</option>
                            <option value="submissions">Submissions</option>
                        </select>
                    </label>
                    <label class="w-32">
                        <span class="text-sm">Minutes</span>
                        <input name="extendMinutes" type="number" class="input" value="30" min="1" max="1440" />
                    </label>
                    <label class="min-w-40 flex-1">
                        <span class="text-sm">Reason</span>
                        <input name="reason" class="input" placeholder="AV failure during demos" />
                    </label>
                    <button class="btn btn-sm preset-filled-warning-500">Extend</button>
                </div>
            </form>
        </section>

        <!-- ── What participants can do ─────────────────────────────── -->
        {#if data.capabilities.length > 0}
            <section class="flex flex-col gap-3">
                <div>
                    <h2 class="text-xl font-bold">What participants can do now</h2>
                    <p class="text-sm text-surface-500">
                        Each switch is what the backend actually checks. The phase links are
                        display only — they tell people when something opens, they never open
                        it. Marking a phase current above may flip these too.
                    </p>
                </div>

                {#each data.capabilities as c (c.capability)}
                    <form method="POST" action="?/editCapability" use:enhance
                          class="card preset-outlined-surface-200-800 flex flex-col gap-3 p-4">
                        <input type="hidden" name="capability" value={c.capability} />
                        <div class="flex flex-wrap items-center justify-between gap-3">
                            <span class="flex flex-wrap items-center gap-2">
                                <span class="font-semibold">{c.label}</span>
                                <span class="badge {c.statePreset}">{c.stateLabel}</span>
                                {#if c.opensAt}
                                    <span class="text-sm text-surface-500">opens {fmt(c.opensAt)}</span>
                                {/if}
                                {#if c.closesAt}
                                    <span class="text-sm text-surface-500">closes {fmt(c.closesAt)}</span>
                                {/if}
                            </span>
                            <div class="flex shrink-0 gap-2">
                                <button name="enabled" value="true" class="btn btn-sm preset-tonal-success">
                                    Open
                                </button>
                                <button name="enabled" value="false" class="btn btn-sm preset-tonal-error">
                                    Close
                                </button>
                            </div>
                        </div>

                        {#if data.phases.length > 0}
                            <div class="grid gap-3 sm:grid-cols-2">
                                <label>
                                    <span class="text-sm">Announced as opening in</span>
                                    <select name="openInPhaseId" class="select">
                                        <option value="">No phase</option>
                                        {#each data.phases as ph (ph.id)}
                                            <option value={ph.id} selected={ph.id === c.openInPhaseId}>
                                                {ph.name}
                                            </option>
                                        {/each}
                                    </select>
                                </label>
                                <label>
                                    <span class="text-sm">Announced as closing in</span>
                                    <select name="closedInPhaseId" class="select">
                                        <option value="">No phase</option>
                                        {#each data.phases as ph (ph.id)}
                                            <option value={ph.id} selected={ph.id === c.closedInPhaseId}>
                                                {ph.name}
                                            </option>
                                        {/each}
                                    </select>
                                </label>
                            </div>
                            <div><button class="btn btn-sm preset-tonal">Save announcement</button></div>
                        {/if}
                    </form>
                {/each}
            </section>
        {/if}

        <!-- ── Prizes ───────────────────────────────────────────────── -->
        <section class="flex flex-col gap-3">
            <div>
                <h2 class="text-xl font-bold">Prizes</h2>
                <p class="text-sm text-surface-500">
                    The table of what can be won. Rank 0 is a special prize — Community
                    Choice and the like — that sits outside the ranking.
                </p>
            </div>

            {#if form?.prizes}
                <div class="card preset-outlined-success-500 p-4">
                    <h3 class="mb-2 font-semibold">Saved prize table</h3>
                    <ul class="text-sm">
                        {#each form.prizes as p, i (i)}
                            <li>{p.rank === 0 ? 'Special' : `#${p.rank}`} — {p.title}</li>
                        {/each}
                    </ul>
                </div>
            {/if}

            <form method="POST" action="?/setPrizes" use:enhance={keepValues}
                  class="card preset-outlined-surface-200-800 flex flex-col gap-3 p-4">
                <h3 class="font-semibold">Prize table</h3>
                {#each prizeRows as row (row.id)}
                    <div class="flex flex-wrap items-end gap-2">
                        <label class="w-24">
                            <span class="text-sm">Rank</span>
                            <input name="rank" type="number" min="0" class="input" bind:value={row.rank} />
                        </label>
                        <label class="min-w-40 flex-1">
                            <span class="text-sm">Title</span>
                            <input name="title" class="input" bind:value={row.title}
                                   placeholder="First prize" />
                        </label>
                        <button type="button" class="btn btn-sm preset-tonal-error"
                                onclick={() => (prizeRows = prizeRows.filter((r) => r.id !== row.id))}>
                            Remove
                        </button>
                    </div>
                {/each}
                <p class="text-xs text-surface-500">
                    Saving writes this whole table, replacing what was there before.
                </p>
                <div class="flex flex-wrap gap-2">
                    <button type="button" class="btn btn-sm preset-tonal" onclick={addPrizeRow}>
                        Add row
                    </button>
                    <button class="btn btn-sm preset-filled-primary-500">Save prize table</button>
                </div>
            </form>

            <form method="POST" action="?/editPrize" use:enhance
                  class="card preset-outlined-surface-200-800 flex flex-wrap items-end gap-3 p-4">
                <div class="w-full">
                    <h3 class="font-semibold">Rename one prize</h3>
                    <p class="text-sm text-surface-500">Leaves the rest of the table alone.</p>
                </div>
                <label class="w-24">
                    <span class="text-sm">Rank</span>
                    <input name="rank" type="number" min="0" class="input" value="1" />
                </label>
                <label class="min-w-40 flex-1">
                    <span class="text-sm">New title</span>
                    <input name="title" class="input" required />
                </label>
                <button class="btn btn-sm preset-tonal-primary">Rename</button>
            </form>

            <form method="POST" action="?/finalizePrizes" use:enhance={keepValues}
                  class="card preset-outlined-error-500 flex flex-col gap-3 p-4">
                <div>
                    <h3 class="font-semibold">Award the prizes</h3>
                    <p class="text-sm text-surface-500">
                        Votes are advice; this is the decision. Finalizing writes the winners
                        and there is no undo — read the names once more before you confirm.
                    </p>
                </div>

                {#if data.submissions.length === 0}
                    <p class="text-sm text-surface-500">Nothing has been submitted yet.</p>
                {:else}
                    {#each awardRows as row (row.id)}
                        <div class="flex flex-wrap items-end gap-2">
                            <label class="w-24">
                                <span class="text-sm">Rank</span>
                                <input name="awardRank" type="number" min="0" class="input" bind:value={row.rank} />
                            </label>
                            <label class="min-w-32 flex-1">
                                <span class="text-sm">or special prize</span>
                                <input name="awardSpecial" class="input" bind:value={row.special}
                                       placeholder="Community Choice" />
                            </label>
                            <label class="min-w-40 flex-1">
                                <span class="text-sm">Winner</span>
                                <select name="awardSubmission" class="select" bind:value={row.submissionId}>
                                    <option value="">Pick a submission</option>
                                    {#each data.submissions as s (s.id)}
                                        <option value={s.id}>{s.label}</option>
                                    {/each}
                                </select>
                            </label>
                            <button type="button" class="btn btn-sm preset-tonal-error"
                                    onclick={() => (awardRows = awardRows.filter((r) => r.id !== row.id))}>
                                Remove
                            </button>
                        </div>
                    {/each}
                    <p class="text-xs text-surface-500">
                        Name a special prize to award one outside the ranking; otherwise the
                        rank decides which prize this is.
                    </p>
                    <label class="flex items-center gap-2">
                        <input type="checkbox" class="checkbox" required />
                        <span class="text-sm">I understand this publishes the results and cannot be undone.</span>
                    </label>
                    <div class="flex flex-wrap gap-2">
                        <button type="button" class="btn btn-sm preset-tonal" onclick={addAwardRow}>
                            Add winner
                        </button>
                        <button class="btn btn-sm preset-filled-error-500">Finalize awards</button>
                    </div>
                {/if}
            </form>
        </section>

        <!-- ── Event settings ───────────────────────────────────────── -->
        <section class="flex flex-col gap-3">
            <div>
                <h2 class="text-xl font-bold">Event settings</h2>
                <p class="text-sm text-surface-500">
                    The name, dates and description everyone sees, plus the two master
                    switches.
                </p>
            </div>

            <form method="POST" action="?/editEvent" use:enhance={withTimes()}
                  class="card preset-outlined-surface-200-800 flex flex-col gap-3 p-4">
                <label>
                    <span class="text-sm">Name</span>
                    <input name="name" class="input" value={data.hackathon.name} required />
                </label>
                <label>
                    <span class="text-sm">Description</span>
                    <textarea name="description" class="textarea min-h-32" rows="6">{data.hackathon.description ?? ''}</textarea>
                </label>
                <div class="grid gap-3 sm:grid-cols-2">
                    <label>
                        <span class="text-sm">Starts</span>
                        <input name="startsAt" type="datetime-local" class="input"
                               value={dtLocal(data.hackathon.startsAt)} />
                    </label>
                    <label>
                        <span class="text-sm">Ends</span>
                        <input name="endsAt" type="datetime-local" class="input"
                               value={dtLocal(data.hackathon.endsAt)} />
                    </label>
                </div>
                <label>
                    <span class="text-sm">Visibility</span>
                    <select name="visibility" class="select">
                        <option value="1" selected={data.hackathon.visibility === 1}>
                            Public — listed for everyone
                        </option>
                        <option value="2" selected={data.hackathon.visibility === 2}>
                            Private — invitation links only
                        </option>
                    </select>
                </label>
                <p class="text-xs text-surface-500">Give both dates or neither.</p>
                <div><button class="btn btn-sm preset-filled-primary-500">Save event</button></div>
            </form>

            <form method="POST" action="?/editSettings" use:enhance
                  class="card preset-outlined-surface-200-800 flex flex-col gap-3 p-4">
                <label class="flex items-center gap-2">
                    <input name="registrationsEnabled" type="checkbox" class="checkbox"
                           checked={data.settings?.registrationsEnabled} />
                    <span class="text-sm">People can register</span>
                </label>
                <label class="flex items-center gap-2">
                    <input name="votingEnabled" type="checkbox" class="checkbox"
                           checked={data.settings?.votingEnabled} />
                    <span class="text-sm">Voting is running</span>
                </label>
                <div><button class="btn btn-sm preset-filled-primary-500">Save switches</button></div>
            </form>
        </section>
    {/if}
</div>
