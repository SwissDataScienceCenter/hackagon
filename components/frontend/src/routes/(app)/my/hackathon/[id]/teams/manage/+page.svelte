<script lang="ts">
    import { resolve } from '$app/paths';
    import { enhance } from '$app/forms';
    import { Check, Download, GripVertical, Pencil, Trash2, Upload, X } from 'lucide-svelte';
    import type { ActionData, PageData } from './$types';

    type Person = {
        id: string;
        name: string;
        preferredTitles: string[];
        affiliation?: string;
        skills?: string;
    };

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const hackathonId = $derived(data.hackathonId);
    const unassigned = $derived(data.unassigned);

    // Roster filter. Matches across everything shown on a row — name, team,
    // affiliation, skills, preferred projects — because an organiser staffing a
    // project searches for "rust" or "EPFL" as readily as for a person.
    let rosterQuery = $state('');
    const roster = $derived(
        data.roster.filter((p) => {
            const q = rosterQuery.trim().toLowerCase();
            if (q === '') return true;
            return [
                p.name,
                p.teamName,
                p.affiliation,
                p.skills,
                ...p.preferredTitles,
                // Answer TEXT, not just labels: 'who mentioned Kubernetes?' is
                // the question this panel exists to answer.
                ...p.answers.flatMap((a) => [a.label, a.value]),
            ]
                .join(' ')
                .toLowerCase()
                .includes(q);
        })
    );
    const unassignedCount = $derived(data.roster.filter((p) => !p.teamName).length);
    const projectRows = $derived(data.projectRows);

    // Drop target id for the unassigned pool; team ids are used as-is.
    const POOL = 'pool';

    let draggedId: string | null = $state(null);
    let draggedFrom: string | null = $state(null);
    let dropTarget: string | null = $state(null);
    let pending: boolean = $state(false);

    let moveForm: HTMLFormElement;
    let moveUserId: HTMLInputElement;
    let moveToTeamId: HTMLInputElement;

    let deleteForm: HTMLFormElement;
    let deleteTeamId: HTMLInputElement;

    // Only one team's name is editable at a time.
    let editingTeamId: string | null = $state(null);
    let editName = $state('');

    function startEdit(id: string, name: string) {
        editingTeamId = id;
        editName = name;
    }

    function cancelEdit() {
        editingTeamId = null;
    }

    function confirmDelete(id: string, name: string) {
        if (!confirm(`Delete "${name}"? Its members will become unassigned.`)) return;
        deleteTeamId.value = id;
        deleteForm.requestSubmit();
    }

    function startDrag(event: DragEvent, userId: string, from: string) {
        draggedId = userId;
        draggedFrom = from;
        if (event.dataTransfer) {
            event.dataTransfer.setData('text/plain', userId);
            event.dataTransfer.effectAllowed = 'move';
        }
    }

    function endDrag() {
        draggedId = null;
        draggedFrom = null;
        dropTarget = null;
    }

    function canDrop(target: string) {
        return draggedId !== null && draggedFrom !== target;
    }

    function dragOver(event: DragEvent, target: string) {
        if (!canDrop(target)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        dropTarget = target;
    }

    function dragLeave(target: string) {
        if (dropTarget === target) dropTarget = null;
    }

    function drop(event: DragEvent, target: string) {
        if (!canDrop(target)) return;
        event.preventDefault();
        const userId = draggedId as string;
        endDrag();
        move(userId, target === POOL ? '' : target);
    }

    // Single hidden form for every move, so drag-and-drop and the unassign
    // button share one enhanced submit path.
    function move(userId: string, toTeamId: string) {
        moveUserId.value = userId;
        moveToTeamId.value = toTeamId;
        moveForm.requestSubmit();
    }

    // ─── Bulk import ────────────────────────────────────────────────────────
    // `previewImport` writes nothing: it hands back the plan, which is rendered
    // below, and only then is there an Apply button. A file picker that mutated
    // the roster on selection would be irreversible and unreviewable.
    const preview = $derived(form?.importPreview ?? null);
    const importResult = $derived(form?.importResult ?? null);

    const STATUS_BADGE: Record<string, string> = {
        assign: 'badge-info',
        create: 'badge-success',
        unassign: 'badge-warning',
        unchanged: 'badge-neutral',
        error: 'badge-danger'
    };
    const STATUS_LABEL: Record<string, string> = {
        assign: 'Move',
        create: 'New team',
        unassign: 'Unassign',
        unchanged: 'No change',
        error: 'Cannot apply'
    };

    /** "3 joins, 1 new team, 2 leave a team, 6 unchanged" — what Apply will do. */
    function planSummary(counts: {
        assign: number;
        create: number;
        unassign: number;
        unchanged: number;
    }): string {
        const parts = [
            counts.assign > 0 && `${counts.assign} moved onto an existing team`,
            counts.create > 0 && `${counts.create} moved onto a new team`,
            counts.unassign > 0 && `${counts.unassign} taken off their team`,
            counts.unchanged > 0 && `${counts.unchanged} unchanged`
        ].filter(Boolean);

        return parts.length > 0 ? parts.join(', ') : 'nothing to change';
    }
</script>

<form
    method="POST"
    action="?/move"
    class="hidden"
    bind:this={moveForm}
    use:enhance={() => {
        pending = true;
        return async ({ update }) => {
            await update();
            pending = false;
        };
    }}
>
    <input type="hidden" name="userId" bind:this={moveUserId} />
    <input type="hidden" name="toTeamId" bind:this={moveToTeamId} />
</form>

<form
    method="POST"
    action="?/deleteTeam"
    class="hidden"
    bind:this={deleteForm}
    use:enhance={() => {
        pending = true;
        return async ({ update }) => {
            await update();
            pending = false;
        };
    }}
>
    <input type="hidden" name="teamId" bind:this={deleteTeamId} />
</form>

{#snippet personChip(person: Person, from: string)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        draggable="true"
        ondragstart={(e) => startDrag(e, person.id, from)}
        ondragend={endDrag}
        class="card flex cursor-grab items-start gap-1.5 px-2 py-1 text-xs text-ink
               active:cursor-grabbing"
        class:opacity-40={draggedId === person.id}
        title={from === POOL
            ? 'Drag onto a team to assign'
            : person.preferredTitles.length > 0
              ? `Prefers: ${person.preferredTitles.join(', ')}`
              : undefined}
    >
        <GripVertical class="mt-0.5 size-3 shrink-0 text-ink-3" />
        <div class="flex min-w-0 flex-col">
            <span class="min-w-0 truncate">{person.name}</span>
            {#if from === POOL && person.preferredTitles.length > 0}
                <span class="min-w-0 truncate text-[0.65rem] text-ink-3">
                    Prefers: {person.preferredTitles.join(', ')}
                </span>
            {/if}
        </div>
        {#if from !== POOL}
            <button
                type="button"
                class="ml-0.5 shrink-0 text-ink-3 hover:text-danger-ink"
                aria-label={`Unassign ${person.name}`}
                title="Unassign"
                disabled={pending}
                onclick={() => move(person.id, '')}
            >
                <X class="size-3" />
            </button>
        {/if}
    </div>
{/snippet}

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20" class:opacity-60={pending}>
    <div class="flex items-center justify-between gap-4">
        <div class="flex flex-col gap-1">
            <h2 class="m-0 text-title text-ink">Manage Teams</h2>
            <p class="m-0 text-xs text-ink-3">
                Drag a participant onto a team to assign them. Everyone belongs to at most one team.
            </p>
        </div>
        <a
            href={resolve(`/my/hackathon/${hackathonId}/teams`)}
            class="btn btn-sm btn-ghost no-underline"
        >
            Back to Teams
        </a>
    </div>

    {#if form?.message}
        <p
            class="m-0 rounded-card border border-danger/40 bg-danger/10 px-3 py-2 text-xs
                   text-danger-ink"
            role="alert"
        >
            {form.message}
        </p>
    {/if}

    <!-- Bulk composition: download the roster as a file, fill it in in a
         spreadsheet, upload it back. The preview step is not optional — a bulk
         mutation fired by a file picker cannot be reviewed and cannot be undone. -->
    <section class="card card-raised flex flex-col gap-3 p-3">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h3 class="m-0 meta">Import team composition</h3>
            <!-- Plain links, not forms: both are GETs that return a file, and
                 the browser's own download handles them. `data-sveltekit-reload`
                 keeps the router out of the way — it would otherwise try to
                 treat the response as a page. -->
            <div class="flex items-center gap-1">
                <a
                    class="btn btn-sm btn-ghost no-underline"
                    href={resolve(`/my/hackathon/${hackathonId}/teams/manage/template/csv`)}
                    data-sveltekit-reload
                    download
                >
                    <Download class="size-3" /> CSV template
                </a>
                <a
                    class="btn btn-sm btn-ghost no-underline"
                    href={resolve(`/my/hackathon/${hackathonId}/teams/manage/template/json`)}
                    data-sveltekit-reload
                    download
                >
                    <Download class="size-3" /> JSON template
                </a>
            </div>
        </div>

        <p class="m-0 text-xs text-ink-3">
            A CSV or JSON file with the columns <code>user_email</code>, <code>project</code>
            and <code>team</code>. The template is this event's own roster, already filled in.
            Anyone the file leaves out keeps the team they are on; a row whose project and team
            are both empty takes that person off theirs. A team the file names but this event
            does not have yet is created.
        </p>

        <form
            method="POST"
            action="?/previewImport"
            enctype="multipart/form-data"
            class="flex flex-wrap items-center gap-2"
            use:enhance
        >
            <input
                class="field max-w-full text-xs"
                type="file"
                name="file"
                accept=".csv,.tsv,.json,text/csv,application/json"
                aria-label="Team composition file"
                required
            />
            <button type="submit" class="btn btn-sm">
                <Upload class="size-3" /> Preview import
            </button>
        </form>

        {#if form?.importError}
            <p
                class="m-0 rounded-card border border-danger/40 bg-danger/10 px-3 py-2 text-xs
                       text-danger-ink"
                role="alert"
            >
                {form.importError}
            </p>
        {/if}

        {#if importResult}
            <!-- Applied. The count is what the server MANAGED, not what it
                 planned, and any failure is named — a bulk write that silently
                 half-lands leaves the organiser believing the roster is set. -->
            {#if importResult.failures.length === 0}
                <p
                    class="m-0 rounded-card border border-success/40 bg-success/10 px-3 py-2 text-xs
                           text-success-ink"
                    role="status"
                >
                    Applied {importResult.applied} of {importResult.planned} changes from
                    {importResult.filename}{importResult.created > 0
                        ? `, creating ${importResult.created} team${importResult.created === 1 ? '' : 's'}`
                        : ''}.
                </p>
            {:else}
                <div
                    class="m-0 rounded-card border border-danger/40 bg-danger/10 px-3 py-2 text-xs
                           text-danger-ink"
                    role="alert"
                >
                    <p class="m-0">
                        Applied {importResult.applied} of {importResult.planned} changes from
                        {importResult.filename}; {importResult.failures.length} failed.
                    </p>
                    <ul class="m-0 mt-1 list-disc pl-4">
                        {#each importResult.failures as f, i (i)}
                            <li>{f.email ? `${f.email}: ` : ''}{f.message}</li>
                        {/each}
                    </ul>
                </div>
            {/if}
        {/if}

        {#if preview}
            {@const counts = preview.plan.counts}
            <div class="flex flex-col gap-2">
                {#if counts.errors > 0}
                    <p
                        class="m-0 rounded-card border border-danger/40 bg-danger/10 px-3 py-2 text-xs
                               text-danger-ink"
                        role="alert"
                    >
                        {counts.errors} of {counts.total} rows in {preview.filename} cannot be applied.
                        Nothing has been changed — fix those rows and preview the file again.
                    </p>
                {:else}
                    <!-- The count and its noun are ONE expression: split across
                         two lines of markup they render with a newline between
                         them, which reads fine and defeats any regex written
                         against "3 rows". -->
                    <p class="m-0 text-xs text-ink-2" role="status">
                        {preview.filename}: {counts.total === 1
                            ? '1 row'
                            : `${counts.total} rows`} — {planSummary(counts)}. Nothing has been
                        changed yet.
                    </p>
                {/if}

                <div class="w-full overflow-x-auto rounded-card border border-line">
                    <table class="w-full min-w-[560px] border-collapse text-left text-xs">
                        <caption class="sr-only">Import preview</caption>
                        <thead>
                            <tr class="border-b border-line bg-raised text-ink-3">
                                <th class="px-3 py-2 font-semibold">Row</th>
                                <th class="px-3 py-2 font-semibold">Participant</th>
                                <th class="px-3 py-2 font-semibold">Project</th>
                                <th class="px-3 py-2 font-semibold">Team</th>
                                <th class="px-3 py-2 font-semibold">Outcome</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each preview.plan.rows as r (r.row)}
                                <tr class="border-b border-line last:border-0">
                                    <td class="px-3 py-2 text-ink-3">{r.row}</td>
                                    <td class="px-3 py-2 text-ink">
                                        {r.name || r.email}
                                        {#if r.name}
                                            <span class="block text-[0.65rem] text-ink-3">{r.email}</span>
                                        {/if}
                                    </td>
                                    <td class="px-3 py-2 text-ink-2">{r.project || '—'}</td>
                                    <td class="px-3 py-2 text-ink-2">{r.team || '—'}</td>
                                    <td class="px-3 py-2">
                                        <span class="badge {STATUS_BADGE[r.status]}">
                                            {STATUS_LABEL[r.status]}
                                        </span>
                                        <span class="ml-1 text-ink-2">{r.detail}</span>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>

                {#if counts.errors === 0 && counts.changes > 0}
                    <form
                        method="POST"
                        action="?/applyImport"
                        class="flex items-center gap-2"
                        use:enhance={() => {
                            pending = true;
                            return async ({ update }) => {
                                await update();
                                pending = false;
                            };
                        }}
                    >
                        <!-- The FILE, not the plan: `applyImport` re-parses and
                             re-resolves it server-side, so a hidden field can
                             carry no team or user id of its own choosing. An
                             HTML attribute value normalises CRLF to LF on the
                             way through, which the CSV reader handles — it
                             accepts \r\n, \n and bare \r alike. -->
                        <input type="hidden" name="filename" value={preview.filename} />
                        <input type="hidden" name="fileText" value={preview.fileText} />
                        <button type="submit" class="btn btn-sm btn-primary" disabled={pending}>
                            Apply {counts.changes}
                            {counts.changes === 1 ? 'change' : 'changes'}
                        </button>
                    </form>
                {:else if counts.errors === 0}
                    <p class="m-0 text-xs text-ink-3">
                        This file matches the current teams exactly — there is nothing to apply.
                    </p>
                {/if}
            </div>
        {/if}
    </section>

    <!-- Board on the left, people on the right. Stacked below lg, where a
         320px-wide sidebar would leave the drop targets unusable. -->
    <div class="flex flex-col gap-6 lg:flex-row lg:items-start">
    <div class="flex min-w-0 flex-1 flex-col gap-6">

    <section class="card card-raised flex flex-col gap-4 p-3">
        <h3 class="m-0 meta">
            Projects
        </h3>
        {#if projectRows.length === 0}
            <p class="m-0 text-xs text-ink-3">No projects have been approved yet.</p>
        {:else}
            <div class="flex flex-col divide-y divide-line">
                {#each projectRows as p (p.id)}
                    <div class="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                        <div class="flex items-center gap-2">
                            <span class="truncate text-sm font-semibold text-ink">
                                {p.title}
                            </span>
                            {#if !p.isApproved}
                                <span
                                    class="meta shrink-0"
                                >
                                    (Proposed)
                                </span>
                            {/if}
                        </div>

                        <div class="flex flex-wrap items-stretch gap-3">
                            {#each p.teams as t (t.id)}
                                <!-- svelte-ignore a11y_no_static_element_interactions -->
                                <section
                                    ondragover={(e) => dragOver(e, t.id)}
                                    ondragleave={() => dragLeave(t.id)}
                                    ondrop={(e) => drop(e, t.id)}
                                    class="card flex w-56 flex-col"
                                    class:border-accent={dropTarget === t.id}
                                >
                                    <header
                                        class="flex items-center gap-1 border-b border-line
                                               px-2 py-1"
                                    >
                                        {#if editingTeamId === t.id}
                                            <form
                                                method="POST"
                                                action="?/renameTeam"
                                                class="flex flex-1 items-center gap-1"
                                                use:enhance={() => {
                                                    return async ({ result, update }) => {
                                                        if (result.type !== 'failure') {
                                                            editingTeamId = null;
                                                        }
                                                        await update();
                                                    };
                                                }}
                                            >
                                                <input type="hidden" name="teamId" value={t.id} />
                                                <input
                                                    type="text"
                                                    name="name"
                                                    required
                                                    minlength="3"
                                                    maxlength="255"
                                                    autofocus
                                                    bind:value={editName}
                                                    onkeydown={(e) => {
                                                        if (e.key === 'Escape') cancelEdit();
                                                    }}
                                                    class="field h-6 min-w-0 flex-1 px-1"
                                                />
                                                <button
                                                    type="submit"
                                                    class="shrink-0 text-ink-3 hover:text-success-ink"
                                                    aria-label="Save name"
                                                    title="Save"
                                                >
                                                    <Check class="size-3" />
                                                </button>
                                                <button
                                                    type="button"
                                                    class="shrink-0 text-ink-3 hover:text-danger-ink"
                                                    aria-label="Cancel rename"
                                                    title="Cancel"
                                                    onclick={cancelEdit}
                                                >
                                                    <X class="size-3" />
                                                </button>
                                            </form>
                                        {:else}
                                            <span
                                                class="min-w-0 flex-1 truncate text-xs font-bold
                                                       text-ink"
                                            >
                                                {t.name}
                                            </span>
                                            <button
                                                type="button"
                                                class="shrink-0 text-ink-3 hover:text-accent-ink"
                                                aria-label={`Rename ${t.name}`}
                                                title="Rename"
                                                onclick={() => startEdit(t.id, t.name)}
                                            >
                                                <Pencil class="size-3" />
                                            </button>
                                            <button
                                                type="button"
                                                class="shrink-0 text-ink-3 hover:text-danger-ink"
                                                aria-label={`Delete ${t.name}`}
                                                title="Delete"
                                                onclick={() => confirmDelete(t.id, t.name)}
                                            >
                                                <Trash2 class="size-3" />
                                            </button>
                                        {/if}
                                    </header>
                                    <div
                                        class="flex min-h-16 flex-1 flex-wrap content-start gap-2 p-2"
                                    >
                                        {#if t.members.length === 0}
                                            <p class="m-0 text-xs text-ink-3">
                                                Drop a participant here.
                                            </p>
                                        {:else}
                                            {#each t.members as member (member.id)}
                                                {@render personChip(member, t.id)}
                                            {/each}
                                        {/if}
                                    </div>
                                </section>
                            {/each}

                            <form method="POST" action="?/createTeam" use:enhance>
                                <input type="hidden" name="projectId" value={p.id} />
                                <button
                                    type="submit"
                                    class="btn btn-sm btn-ghost h-full"
                                    title={p.teams.length === 0
                                        ? 'Create the default team for this project'
                                        : 'Create another team for this project'}
                                >
                                    {p.teams.length === 0 ? '+ Add Team' : '+'}
                                </button>
                            </form>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </section>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <section
        ondragover={(e) => dragOver(e, POOL)}
        ondragleave={() => dragLeave(POOL)}
        ondrop={(e) => drop(e, POOL)}
        class="card card-raised flex flex-col gap-3 p-3"
        class:border-accent={dropTarget === POOL}
    >
        <h3 class="m-0 meta">
            Unassigned ({unassigned.length})
        </h3>
        {#if unassigned.length === 0}
            <p class="m-0 text-xs text-ink-3">
                Every confirmed participant is on a team.
            </p>
        {:else}
            <div class="flex flex-wrap gap-2">
                {#each unassigned as person (person.id)}
                    {@render personChip(person, POOL)}
                {/each}
            </div>
        {/if}
    </section>
    </div>

    <!-- The people panel. The board is organised by PROJECT, which cannot
         answer "where is this person, and what can they do?" without scanning
         every column — so that question gets its own surface, beside the board
         rather than under it, and it stays put while you drag. -->
    <aside class="flex w-full shrink-0 flex-col gap-3 lg:sticky lg:top-4 lg:w-80 lg:self-start">
        <div class="card card-raised flex flex-col gap-3 p-3">
            <div class="flex items-baseline justify-between gap-2">
                <h3 class="m-0 meta">People ({roster.length})</h3>
                <span class="text-xs text-ink-3">{unassignedCount} unassigned</span>
            </div>

            <label class="flex flex-col gap-1">
                <span class="sr-only">Filter people</span>
                <input
                    class="field"
                    type="search"
                    bind:value={rosterQuery}
                    placeholder="Filter by name, skill, affiliation…"
                />
            </label>

            {#if roster.length === 0}
                <p class="m-0 py-4 text-center text-xs text-ink-3">No one matches that.</p>
            {:else}
                <ul class="m-0 flex max-h-[32rem] list-none flex-col gap-2 overflow-y-auto p-0">
                    {#each roster as p (p.id)}
                        <li class="flex flex-col gap-1 rounded-field border border-line p-2">
                            <div class="flex items-baseline justify-between gap-2">
                                <span class="truncate text-sm font-semibold text-ink">{p.name}</span>
                                {#if p.teamName}
                                    <span class="badge badge-success shrink-0 text-xs">{p.teamName}</span>
                                {:else}
                                    <span class="badge badge-warning shrink-0 text-xs">Unassigned</span>
                                {/if}
                            </div>
                            {#if p.affiliation}
                                <span class="truncate text-xs text-ink-2">{p.affiliation}</span>
                            {/if}
                            {#if p.skills}
                                <span class="text-xs text-ink-3">{p.skills}</span>
                            {/if}
                            {#if p.preferredTitles.length > 0}
                                <span class="text-xs text-ink-3">★ {p.preferredTitles.join(', ')}</span>
                            {/if}
                            {#if p.answers.length > 0}
                                <!-- Collapsed by default: the answers are the
                                     reason to open a row, not something to
                                     read down the whole list. A native
                                     <details> so it works before hydration. -->
                                <details class="mt-0.5">
                                    <summary class="cursor-pointer text-xs text-ink-3">
                                        Registration answers ({p.answers.length})
                                    </summary>
                                    <dl class="m-0 mt-1 flex flex-col gap-1">
                                        {#each p.answers as a (a.label)}
                                            <div class="flex flex-col">
                                                <dt class="text-[0.65rem] uppercase text-ink-3">
                                                    {a.label}
                                                </dt>
                                                <dd class="m-0 text-xs text-ink-2">{a.value}</dd>
                                            </div>
                                        {/each}
                                    </dl>
                                </details>
                            {/if}
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    </aside>
    </div>
</div>
