<script lang="ts">
    import { enhance } from '$app/forms';
    import { resolve } from '$app/paths';
    import {
        Check,
        CircleHelp,
        Download,
        Eraser,
        GripVertical,
        Lock as LockIcon,
        Pencil,
        Trash2,
        Upload,
        X
    } from 'lucide-svelte';
    import ManageHubBackLink from '$lib/components/hackathon/ManageHubBackLink.svelte';
    import { applyAssignmentCsv, type ImportResult } from '$lib/utils/teamAssignmentCsv';
    import { initialsOf } from '$lib/utils/teamDistribution';
    import {
        LABEL_MAX,
        answerText,
        optionText,
        restoreLabels,
        setLabels,
        shortName,
        type AnswerLabels
    } from '$lib/utils/teamAnswerLabels';
    import {
        NO_FILTERS,
        countAnswers,
        countPreferences,
        isFiltering,
        matchesFirst,
        restoreFilters,
        setText,
        toggleAnswer,
        toggleProject,
        type PoolFilters
    } from '$lib/utils/teamPoolFilter';
    import type { ActionData, PageData } from './$types';

    type Person = {
        id: string;
        name: string;
        /** Their registration answers by question id: a code, or free text whole. */
        codes: Record<string, { code: string; label: string }>;
        preferredTitles: string[];
        preferredProjectIds: string[];
        /** Numbers of the preferred projects that have a row on this page. */
        preferredNumbers: number[];
    };

    /** A team as this page currently wants it. `id` is null until it is saved. */
    type WorkTeam = {
        key: string;
        id: string | null;
        projectId: string;
        name: string;
        memberIds: string[];
    };

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const hackathonId = $derived(data.hackathonId);
    const projectRows = $derived(data.projectRows);
    const answerQuestions = $derived(data.answerQuestions);

    // Which registration answers ride along beside a name. A view preference of
    // one organiser at one screen: a question carries no field saying it belongs
    // here, so this is kept in their browser and a co-organiser's page is
    // unaffected by it.
    let shownIds: string[] = $state([]);

    const storageKey = $derived(`hackagon:team-answers:${hackathonId}`);

    // Restored rather than defaulted, and re-read whenever the load changes:
    // saving reloads the page's data, and the ticks should survive that. Writing
    // is `toggleQuestion`'s job and deliberately not this effect's — one that
    // both read and wrote `shownIds` would overwrite the stored value with the
    // empty default on first render.
    $effect(() => {
        const known = new Set(answerQuestions.map((q) => q.id));
        let stored: unknown = null;
        try {
            stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
        } catch {
            // No storage, or something in it that is not ours. Nothing ticked.
        }
        shownIds = Array.isArray(stored)
            ? stored.filter((id): id is string => typeof id === 'string' && known.has(id))
            : [];
    });

    const shownQuestions = $derived(answerQuestions.filter((q) => shownIds.includes(q.id)));

    function toggleQuestion(id: string) {
        shownIds = shownIds.includes(id)
            ? shownIds.filter((q) => q !== id)
            : [...shownIds, id];
        try {
            localStorage.setItem(storageKey, JSON.stringify(shownIds));
        } catch {
            // Private browsing, or a full quota. The ticks still hold for this visit.
        }
    }

    // Whether the "Prefers 3, 7" line rides along beside a name, kept like the
    // question ticks. Shown unless turned off, which is how the page always
    // looked; the "?" for a team off someone's preferences stays regardless —
    // that is a warning about the assignment, not a preference on display.
    let showPreferences = $state(true);

    const preferencesKey = $derived(`hackagon:team-show-preferences:${hackathonId}`);

    $effect(() => {
        let stored: unknown = null;
        try {
            stored = JSON.parse(localStorage.getItem(preferencesKey) ?? 'null');
        } catch {
            // No storage, or something in it that is not ours. Shown.
        }
        showPreferences = stored !== false;
    });

    function toggleShowPreferences() {
        showPreferences = !showPreferences;
        try {
            localStorage.setItem(preferencesKey, JSON.stringify(showPreferences));
        } catch {
            // Private browsing, or a full quota. The tick still holds for this visit.
        }
    }

    /**
     * The ticked questions this person answered, in question order, as the
     * question's letter and the answer itself — `A: XL` — with the question in
     * full on hover. Fixed answers as tags, free text as lines of its own: a
     * sentence does not fit in a tag.
     */
    function answersFor(person: Person) {
        const tags: { key: string; text: string; title: string }[] = [];
        const texts: { key: string; text: string; title: string }[] = [];
        for (const q of shownQuestions) {
            const answer = person.codes[q.id];
            if (!answer) continue;
            const entry = {
                key: q.id,
                text: answerText(q, answer.label, labels),
                title: `${q.label}: ${answer.label}`
            };
            (q.kind === 'text' ? texts : tags).push(entry);
        }

        return { tags, texts };
    }

    const KIND_NOTE: Partial<Record<string, string>> = { bool: 'yes / no', text: 'free text' };

    // What the organizer has named each question — `size` for B, `remote` and
    // `on site` for a tick-box's Yes and No. Kept in the browser like the
    // ticks; see `teamAnswerLabels`.
    let labels: AnswerLabels = $state({});

    const labelsKey = $derived(`hackagon:team-answer-labels:${hackathonId}`);

    // Restored the way `shownIds` is, and for the same reason it only reads.
    $effect(() => {
        let stored: unknown = null;
        try {
            stored = JSON.parse(localStorage.getItem(labelsKey) ?? 'null');
        } catch {
            // No storage, or something in it that is not ours. Letters it is.
        }
        labels = restoreLabels(stored, answerQuestions);
    });

    // One question's names are editable at a time, like a team's name.
    let namingId: string | null = $state(null);
    let draft = $state({ short: '', yes: '', no: '' });

    function startNaming(q: (typeof answerQuestions)[number]) {
        const named = labels[q.id];
        namingId = q.id;
        draft = { short: named?.short ?? '', yes: named?.yes ?? '', no: named?.no ?? '' };
    }

    function commitNaming(q: (typeof answerQuestions)[number]) {
        labels = setLabels(labels, q, draft);
        namingId = null;
        try {
            localStorage.setItem(labelsKey, JSON.stringify(labels));
        } catch {
            // Private browsing, or a full quota. The names still hold for this visit.
        }
    }

    function namingKeys(e: KeyboardEvent, q: (typeof answerQuestions)[number]) {
        if (e.key === 'Enter') commitNaming(q);
        if (e.key === 'Escape') namingId = null;
    }

    // Which answers bring people to the top of the Unassigned column. The rules
    // live in `teamPoolFilter`; this keeps them, stores them and draws them.
    //
    // Kept in the browser like the ticks above, so a reload keeps the filter.
    // That is safe because a filter only reorders, the pool says how many
    // match, and a reset is one click away.
    let filters: PoolFilters = $state(NO_FILTERS);

    const filterKey = $derived(`hackagon:team-filters:${hackathonId}`);

    // Restored the way `shownIds` is, and for the same reason it only reads.
    $effect(() => {
        let stored: unknown = null;
        try {
            stored = JSON.parse(localStorage.getItem(filterKey) ?? 'null');
        } catch {
            // No storage, or something in it that is not ours. No filter.
        }
        filters = restoreFilters(
            stored,
            answerQuestions,
            projectRows.map((p) => p.id)
        );
    });

    function setFilters(next: PoolFilters) {
        filters = next;
        try {
            localStorage.setItem(filterKey, JSON.stringify(next));
        } catch {
            // Private browsing, or a full quota. The filter still holds for this visit.
        }
    }

    /** The filters as removable tags: projects in row order, then questions. */
    const activeFilters = $derived([
        ...projectRows
            .filter((p) => filters.projects.includes(p.id))
            .map((p) => ({
                key: `project:${p.id}`,
                text: `Prefers ${p.number}`,
                title: `Prefers ${p.title}`,
                remove: () => setFilters(toggleProject(filters, p.id))
            })),
        ...answerQuestions.flatMap((q) => [
            ...(filters.answers[q.id] ?? []).map((label) => ({
                key: `${q.id}:${label}`,
                text: answerText(q, label, labels),
                title: `${q.label}: ${label}`,
                remove: () => setFilters(toggleAnswer(filters, q.id, label))
            })),
            ...(filters.texts[q.id] !== undefined
                ? [
                      {
                          key: `${q.id}:text`,
                          text: `${shortName(q, labels)}: "${filters.texts[q.id]?.trim()}"`,
                          title: `${q.label} contains "${filters.texts[q.id]?.trim()}"`,
                          remove: () => setFilters(setText(filters, q.id, ''))
                      }
                  ]
                : [])
        ])
    ]);

    // Drop target id for the unassigned pool; team keys are used as-is.
    const POOL = 'pool';

    // The one size rule. Above this a team stops being a team; there is
    // deliberately no minimum, so a project two people want is a team of two.
    const TEAM_MAX = 6;

    /** The teams exactly as the server last reported them. */
    function fromServer(rows: PageData['projectRows']): WorkTeam[] {
        return rows.flatMap((p) =>
            p.teams.map((t) => ({
                key: t.id,
                id: t.id,
                projectId: p.id,
                name: t.name,
                memberIds: t.members.map((m) => m.id)
            }))
        );
    }

    // Everything on this page is an edit to `teams`, and nothing is written
    // until Save. One mental model: the page is a workspace, not a series of
    // instructions to the backend.
    let teams: WorkTeam[] = $state(fromServer(data.projectRows));
    let invented = 0;

    // A fresh load — first render, or the reload that follows a save — replaces
    // the workspace with what the server now holds.
    $effect(() => {
        teams = fromServer(data.projectRows);
        invented = 0;
        editingKey = null;
        // The summary describes a workspace that no longer exists.
        importResult = null;
    });

    let draggedId: string | null = $state(null);
    let draggedFrom: string | null = $state(null);
    let dropTarget: string | null = $state(null);
    let pending: boolean = $state(false);

    let saveForm: HTMLFormElement;
    let savePayload: HTMLInputElement;

    /** What the last uploaded file did, until it is dismissed or superseded. */
    let importResult: ImportResult | null = $state(null);

    // "How assignment works". Closed by default: whoever needs the rules asks
    // for them, and everyone else should not have to read past them.
    let helpOpen = $state(false);

    // Only one team's name is editable at a time.
    let editingKey: string | null = $state(null);
    let editName = $state('');

    // Everyone in the hackathon, assigned or not — the workspace holds ids and
    // needs to resolve them back to people.
    const peopleById = $derived(
        new Map<string, Person>(
            [
                ...data.unassigned,
                ...projectRows.flatMap((p) => p.teams.flatMap((t) => t.members))
            ].map((p) => [p.id, p])
        )
    );

    // Plain records rather than Maps for the grouping below: every key is a
    // uuid, none of it is reactive state, and svelte/prefer-svelte-reactivity
    // would otherwise push a mutated Map towards SvelteMap.
    const teamsByProject = $derived.by(() => {
        const byProject: Record<string, WorkTeam[]> = {};
        for (const t of teams) (byProject[t.projectId] ??= []).push(t);

        return byProject;
    });

    const unassigned = $derived.by(() => {
        const placed = new Set(teams.flatMap((t) => t.memberIds));

        return [...peopleById.values()].filter((p) => !placed.has(p.id));
    });

    /** The pool with whoever matches the filters on top. */
    const pool = $derived(matchesFirst(unassigned, filters));
    const filtering = $derived(isFiltering(filters));

    // How many unassigned people gave each answer, over the whole pool rather
    // than the matching part, so a number beside an answer does not change as
    // other answers are picked.
    const poolCounts = $derived(countAnswers(unassigned));
    const poolPreferenceCounts = $derived(countPreferences(unassigned));

    function answeredInPool(questionId: string): number {
        return Object.values(poolCounts[questionId] ?? {}).reduce((n, c) => n + c, 0);
    }

    const assignedCount = $derived(teams.reduce((n, t) => n + t.memberIds.length, 0));

    /** What Save would write, compared against what the server last reported. */
    const changes = $derived.by(() => {
        const base = fromServer(data.projectRows);
        const nameBefore = new Map(base.map((t) => [t.key, t.name]));
        // Save drops a team with nobody in it, so an empty one counts as
        // deleted, or as not added — the summary says what Save will do.
        const kept = teams.filter((t) => t.memberIds.length > 0);
        const alive = new Set(kept.map((t) => t.key));

        const added = kept.filter((t) => t.id === null).length;
        const removed = base.filter((t) => !alive.has(t.key)).length;
        const renamed = kept.filter(
            (t) => t.id !== null && nameBefore.get(t.key) !== t.name
        ).length;

        const teamOf = (list: WorkTeam[]) =>
            new Map(list.flatMap((t) => t.memberIds.map((m) => [m, t.key] as const)));
        const before = teamOf(base);
        const after = teamOf(teams);
        let moved = 0;
        for (const id of new Set([...before.keys(), ...after.keys()])) {
            if (before.get(id) !== after.get(id)) moved++;
        }

        const parts: string[] = [];
        if (added > 0) parts.push(`${added} new ${added === 1 ? 'team' : 'teams'}`);
        if (removed > 0) parts.push(`${removed} deleted`);
        if (renamed > 0) parts.push(`${renamed} renamed`);
        if (moved > 0) parts.push(`${moved} ${moved === 1 ? 'move' : 'moves'}`);

        return { total: added + removed + renamed + moved, summary: parts.join(', ') };
    });

    function startEdit(key: string, name: string) {
        editingKey = key;
        editName = name;
    }

    function commitEdit(key: string) {
        const name = editName.trim();
        if (name === '') return;
        const team = teams.find((t) => t.key === key);
        if (team) team.name = name;
        editingKey = null;
    }

    function removeTeam(key: string, name: string) {
        const team = teams.find((t) => t.key === key);
        if (team === undefined) return;
        // Only a team that exists on the server is a real loss — and deleting it
        // takes its submissions with it, so this one asks. A team added here and
        // not yet saved is nothing to lose.
        if (
            team.id !== null &&
            !confirm(`Delete "${name}" when you save? Its members become unassigned.`)
        ) {
            return;
        }
        teams = teams.filter((t) => t.key !== key);
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

    // Once a submission exists or teams are published the assignment is read
    // only: every control that changes it is disabled or gone, and the reason
    // is said once at the top and again on hover. Download and the filters
    // still work — looking is not changing. See `assignmentLockReasons`.
    const lockReasons = $derived(data.lockReasons);
    const locked = $derived(lockReasons.length > 0);
    const lockedTitle = $derived(locked ? `Locked: ${lockReasons.join(' and ')}` : undefined);

    function canDrop(target: string) {
        if (locked) return false;
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
        move(userId, target);
    }

    function move(userId: string, target: string) {
        for (const t of teams) {
            const at = t.memberIds.indexOf(userId);
            if (at !== -1) t.memberIds.splice(at, 1);
        }
        if (target !== POOL) teams.find((t) => t.key === target)?.memberIds.push(userId);
    }

    function addTeam(projectId: string) {
        const count = teams.filter((t) => t.projectId === projectId).length;
        const base = `Team ${initialsOf(projectRows.find((p) => p.id === projectId)?.title ?? '')}`;
        teams.push({
            key: `new-${invented++}`,
            id: null,
            projectId,
            name: count === 0 ? base : `${base} ${count + 1}`,
            memberIds: []
        });
    }

    function clearAll() {
        teams = teams.map((t) => ({ ...t, memberIds: [] }));
    }

    function discard() {
        teams = fromServer(data.projectRows);
        editingKey = null;
        importResult = null;
    }

    /**
     * Read an edited assignment back in. The file replaces every team — see
     * `applyAssignmentCsv` — and lands on the workspace like any other edit:
     * nothing is written until Save, and Discard undoes it.
     */
    async function importFile(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        // Cleared so that picking the same file again still fires a change.
        input.value = '';
        if (file === undefined || pending) return;

        if (teams.length > 0 && !confirm('Uploading replaces all current teams. Continue?')) {
            return;
        }

        const result = applyAssignmentCsv(
            await file.text(),
            {
                people: [...peopleById.values()],
                projects: projectRows.map((p) => ({
                    id: p.id,
                    title: p.title,
                    number: p.number
                })),
                teams
            },
            { max: TEAM_MAX }
        );

        importResult = result;
        if (!result.refused) {
            teams = result.teams;
            editingKey = null;
        }
    }

    /** The import's outcome as sentences, most important first. */
    const importSummary = $derived.by(() => {
        const r = importResult;
        if (r === null) return [];
        if (r.refused) return ['Nothing was applied.'];

        const lines = [
            `${r.teams.length} ${r.teams.length === 1 ? 'team' : 'teams'} with ` +
                `${r.assigned} ${r.assigned === 1 ? 'person' : 'people'}; ` +
                `${r.unassigned} unassigned.`
        ];
        if (r.oversized.length > 0) {
            lines.push(`Over ${TEAM_MAX}: ${r.oversized.join(', ')}.`);
        }

        return lines;
    });

    function save() {
        savePayload.value = JSON.stringify(
            teams.map((t) => ({
                id: t.id,
                projectId: t.projectId,
                name: t.name,
                memberIds: t.memberIds
            }))
        );
        saveForm.requestSubmit();
    }
</script>

<svelte:window
    onbeforeunload={(e) => {
        if (changes.total > 0) e.preventDefault();
    }}
/>

<form
    method="POST"
    action="?/save"
    class="hidden"
    bind:this={saveForm}
    use:enhance={() => {
        pending = true;
        return async ({ update }) => {
            await update();
            pending = false;
        };
    }}
>
    <input type="hidden" name="teams" bind:this={savePayload} />
</form>

{#snippet personRow(
    person: Person,
    from: string,
    projectId: string | null,
    projectNumber: number | null
)}
    {@const matches = projectId !== null && person.preferredProjectIds.includes(projectId)}
    {@const answers = answersFor(person)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        draggable={!locked}
        ondragstart={(e) => startDrag(e, person.id, from)}
        ondragend={endDrag}
        class="flex items-center gap-1.5 rounded-card border border-line bg-raised px-2 py-1"
        class:cursor-grab={!locked}
        class:active:cursor-grabbing={!locked}
        class:opacity-40={draggedId === person.id}
    >
        {#if !locked}
            <GripVertical class="size-3 shrink-0 text-ink-3" />
        {/if}
        <div class="flex min-w-0 flex-1 flex-col">
            <span class="min-w-0 truncate text-xs text-ink">{person.name}</span>
            {#if !showPreferences}
                <!-- Nothing: turned off in the Project preferences box. -->
            {:else if person.preferredNumbers.length > 0}
                <span
                    class="tnum min-w-0 truncate text-[0.65rem] text-ink-3"
                    title={person.preferredTitles.join(', ')}
                >
                    Prefers
                    {#each person.preferredNumbers as n, i (n)}<span
                            class:text-accent-ink={n === projectNumber}
                            class:font-bold={n === projectNumber}>{n}</span
                        >{i < person.preferredNumbers.length - 1 ? ', ' : ''}{/each}
                </span>
            {:else}
                <span
                    class="text-[0.65rem] text-ink-3 italic"
                    title={person.preferredTitles.join(', ')}
                >
                    {person.preferredTitles.length > 0
                        ? 'Prefers nothing on offer'
                        : 'No preferences given'}
                </span>
            {/if}
            {#if answers.tags.length > 0}
                <!-- Not `.badge`: badges uppercase, and these are whatever the
                     organizer typed as an option. -->
                <span class="flex flex-wrap items-center gap-1 pt-0.5">
                    {#each answers.tags as a (a.key)}
                        <span
                            class="max-w-full truncate rounded-field border border-line px-1.5
                                   text-[0.65rem] leading-4 text-ink-2"
                            title={a.title}
                        >
                            {a.text}
                        </span>
                    {/each}
                </span>
            {/if}
            {#each answers.texts as t (t.key)}
                <span class="min-w-0 truncate text-[0.65rem] text-ink-2" title={t.title}>
                    {t.text}
                </span>
            {/each}
        </div>
        {#if projectId !== null && !matches}
            <span
                class="shrink-0 text-[0.65rem] text-warning-ink"
                title="This project is not one of their preferences"
            >
                ?
            </span>
        {/if}
        {#if from !== POOL && !locked}
            <button
                type="button"
                class="shrink-0 text-ink-3 hover:text-danger-ink"
                aria-label={`Unassign ${person.name}`}
                title="Unassign"
                onclick={() => move(person.id, POOL)}
            >
                <X class="size-3" />
            </button>
        {/if}
    </div>
{/snippet}

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20" class:opacity-60={pending}>
    <div class="flex flex-col gap-1">
        <ManageHubBackLink {hackathonId} />
        <h2 class="m-0 text-title text-ink">Manage Teams</h2>
    </div>

    {#if locked}
        <div
            class="flex items-start gap-2 rounded-card border border-warning bg-warning/10 px-3 py-2
                   text-xs text-warning-ink"
            role="status"
        >
            <LockIcon class="mt-0.5 size-3 shrink-0" />
            <p class="m-0">
                <strong>Team assignment is locked:</strong>
                {lockReasons.join(' and ')}. You can still download the spreadsheet and filter
                participants.
            </p>
        </div>
    {/if}

    {#if form?.message}
        <p
            class="m-0 rounded-card border border-danger/40 bg-danger/10 px-3 py-2 text-xs
                   text-danger-ink"
            role="alert"
        >
            {form.message}
        </p>
    {/if}

    <div class="flex flex-wrap items-center gap-3">
        <button
            type="button"
            class="btn btn-sm btn-ghost"
            disabled={locked || pending || assignedCount === 0}
            title={lockedTitle}
            onclick={clearAll}
        >
            <Eraser class="size-3" />
            Clear all
        </button>

        <!-- For when a hundred people is more dragging than anyone wants to do.
             The file is this page in a spreadsheet; what comes back lands on the
             workspace and still waits for Save. -->
        <div class="flex flex-wrap items-center gap-3 border-l border-line pl-3">
            <span class="meta">Spreadsheet</span>
            <a
                href={resolve(`/my/hackathon/${hackathonId}/teams/manage/export`)}
                class="btn btn-sm btn-ghost no-underline"
                title="Everyone on this page, with their preferences and registration answers"
                download
            >
                <Download class="size-3" />
                Download CSV
            </a>
            <!-- A label, so it cannot take `disabled` itself: the input does,
                 and the label is dimmed and stops looking clickable. -->
            <label
                class="btn btn-sm btn-ghost"
                class:cursor-pointer={!locked}
                class:cursor-not-allowed={locked}
                class:opacity-50={locked || pending}
                title={lockedTitle ?? 'Upload an edited spreadsheet'}
            >
                <Upload class="size-3" />
                Upload CSV
                <input
                    type="file"
                    accept=".csv,text/csv"
                    class="hidden"
                    disabled={locked || pending}
                    onchange={importFile}
                />
            </label>
        </div>

        <!-- Outside the Spreadsheet group: it explains assigning teams as a
             whole, dragging and saving included, not only the file. -->
        <button
            type="button"
            class="btn btn-sm btn-quiet"
            aria-expanded={helpOpen}
            aria-controls="assignment-help"
            onclick={() => (helpOpen = !helpOpen)}
        >
            <CircleHelp class="size-3" />
            How assignment works
        </button>

        <div class="ml-auto flex items-center gap-3">
            {#if changes.total > 0}
                <span class="text-xs text-ink-2">Unsaved: {changes.summary}</span>
            {:else}
                <span class="text-xs text-ink-3">No unsaved changes</span>
            {/if}
            <button
                type="button"
                class="btn btn-sm btn-ghost"
                disabled={locked || pending || changes.total === 0}
                title={lockedTitle}
                onclick={discard}
            >
                Discard
            </button>
            <button
                type="button"
                class="btn btn-sm"
                disabled={locked || pending || changes.total === 0}
                title={lockedTitle}
                onclick={save}
            >
                Save
            </button>
        </div>
    </div>

    <!-- The rules of the page in one place: what Save does (see the `save`
         action), when it locks (`assignmentLockReasons`), and what an upload
         does (`applyAssignmentCsv`). Change them together. -->
    {#if helpOpen}
        <section id="assignment-help" class="card card-raised flex flex-col gap-3 p-3 text-xs">
            <div class="flex items-start gap-3">
                <h3 class="m-0 flex-1 meta">How team assignment works</h3>
                <button
                    type="button"
                    class="shrink-0 text-ink-3 hover:text-ink"
                    aria-label="Close"
                    onclick={() => (helpOpen = false)}
                >
                    <X class="size-3" />
                </button>
            </div>

            <div class="flex flex-col gap-1 text-ink-2">
                <p class="m-0">
                    Drag people from Unassigned onto a team, or plan in the spreadsheet.
                </p>
                <p class="m-0">
                    Nothing changes until you Save; Save deletes teams with nobody in them.
                </p>
                <p class="m-0">Locked once a team has a submission or teams are published.</p>
            </div>

            <h4 class="m-0 border-t border-line pt-3 meta">Spreadsheet</h4>
            <ol class="m-0 flex list-decimal flex-col gap-1 pl-4 text-ink-2">
                <li>
                    <strong class="text-ink">Download CSV.</strong> One row per participant, with
                    their current project and team, or empty if they have no team yet.
                </li>
                <li>
                    <strong class="text-ink">Correct the <code>project</code> and <code>team</code>
                        columns.</strong>
                    Keep every row and leave <code>user_id</code> as it is; other columns are ignored.
                </li>
                <li>
                    <strong class="text-ink">Upload CSV.</strong> Replaces all teams. Check, then
                    Save.
                </li>
            </ol>

            <dl class="m-0 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 text-ink-3">
                <dt class="text-ink-2"><code>project</code></dt>
                <dd class="m-0">the project number as shown here and in the prefers column</dd>

                <dt class="text-ink-2"><code>team</code></dt>
                <dd class="m-0">any name, even a single character; can be renamed after upload</dd>

                <dt class="text-ink-2"><code>project_title</code></dt>
                <dd class="m-0">
                    for reading; if it no longer matches the number, that row gets a warning
                </dd>

                <dt class="text-ink-2">both empty</dt>
                <dd class="m-0">the person ends up unassigned</dd>

                <dt class="text-ink-2">incomplete assignment</dt>
                <dd class="m-0">a warning, and the person ends up unassigned</dd>

                <dt class="text-ink-2">a row missing</dt>
                <dd class="m-0">a warning, and the person ends up unassigned</dd>
            </dl>
        </section>
    {/if}

    {#if importResult}
        {@const bad = importResult.refused || importResult.warnings.length > 0}
        <div
            class="flex flex-col gap-2 rounded-card border px-3 py-2 text-xs {bad
                ? 'border-warning bg-warning/10'
                : 'border-success bg-success/10'}"
            role="status"
        >
            <div class="flex items-start gap-3">
                <p class="m-0 flex-1 {bad ? 'text-warning-ink' : 'text-success-ink'}">
                    {importSummary.join(' ')}
                </p>
                <button
                    type="button"
                    class="shrink-0 text-ink-3 hover:text-ink"
                    aria-label="Dismiss"
                    onclick={() => (importResult = null)}
                >
                    <X class="size-3" />
                </button>
            </div>
            {#if importResult.problems.length > 0}
                <!-- Capped, because a file with the wrong id column has one
                     problem per row and a hundred of them says nothing the
                     first five did not. -->
                <ul class="m-0 flex list-disc flex-col gap-0.5 pl-4 text-warning-ink">
                    {#each importResult.problems.slice(0, 5) as problem (problem)}
                        <li>{problem}</li>
                    {/each}
                    {#if importResult.problems.length > 5}
                        <li>and {importResult.problems.length - 5} more.</li>
                    {/if}
                </ul>
                {#if !helpOpen}
                    <button
                        type="button"
                        class="self-start text-ink-2 underline hover:text-ink"
                        onclick={() => (helpOpen = true)}
                    >
                        How assignment works
                    </button>
                {/if}
            {/if}
            {#if importResult.warnings.length > 0}
                <!-- Capped like the problems above: the first few say what kind
                     of mistake the file has, and the rest repeat it. -->
                <ul class="m-0 flex list-disc flex-col gap-0.5 pl-4 text-warning-ink">
                    {#each importResult.warnings.slice(0, 5) as warning (warning)}
                        <li>{warning}</li>
                    {/each}
                    {#if importResult.warnings.length > 5}
                        <li>and {importResult.warnings.length - 5} more.</li>
                    {/if}
                </ul>
            {/if}
        </div>
    {/if}

    <!-- Every question with the name its answers carry on a card — its letter,
         or the short name given here — whether or not it is shown on cards yet. -->
    {#if answerQuestions.length > 0}
        <section class="card card-raised flex flex-col gap-3 p-3">
            <h3 class="m-0 meta">Registration questions</h3>
            <ul class="m-0 flex list-none flex-col divide-y divide-line border-t border-line p-0">
                {#each answerQuestions as q (q.id)}
                    <li class="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2 last:pb-0">
                        {#if namingId === q.id}
                            <span class="flex flex-wrap items-center gap-2">
                                <!-- A tick-box gets words for its two answers and
                                     nothing else; see `QuestionLabels.short`. -->
                                {#if q.kind === 'bool'}
                                    <label class="flex items-center gap-1.5 text-xs text-ink-3">
                                        Yes shows as
                                        <!-- svelte-ignore a11y_autofocus -->
                                        <input
                                            type="text"
                                            class="field h-7 w-24 px-2 text-xs"
                                            placeholder="Yes"
                                            maxlength={LABEL_MAX}
                                            autofocus
                                            bind:value={draft.yes}
                                            onkeydown={(e) => namingKeys(e, q)}
                                        />
                                    </label>
                                    <label class="flex items-center gap-1.5 text-xs text-ink-3">
                                        No shows as
                                        <input
                                            type="text"
                                            class="field h-7 w-24 px-2 text-xs"
                                            placeholder="No"
                                            maxlength={LABEL_MAX}
                                            bind:value={draft.no}
                                            onkeydown={(e) => namingKeys(e, q)}
                                        />
                                    </label>
                                {:else}
                                    <!-- svelte-ignore a11y_autofocus -->
                                    <input
                                        type="text"
                                        class="field h-7 w-28 px-2 text-xs"
                                        placeholder={q.letter}
                                        maxlength={LABEL_MAX}
                                        aria-label={`Short name for ${q.label}`}
                                        autofocus
                                        bind:value={draft.short}
                                        onkeydown={(e) => namingKeys(e, q)}
                                    />
                                {/if}
                                <button
                                    type="button"
                                    class="shrink-0 text-ink-3 hover:text-success-ink"
                                    aria-label="Save names"
                                    title="Save names"
                                    onclick={() => commitNaming(q)}
                                >
                                    <Check class="size-3" />
                                </button>
                                <button
                                    type="button"
                                    class="shrink-0 text-ink-3 hover:text-danger-ink"
                                    aria-label="Cancel"
                                    title="Cancel"
                                    onclick={() => (namingId = null)}
                                >
                                    <X class="size-3" />
                                </button>
                            </span>
                        {/if}
                        <span class="flex min-w-0 items-center gap-2">
                            {#if namingId !== q.id}
                                <button
                                    type="button"
                                    class="btn btn-sm btn-outline shrink-0 font-semibold hover:bg-overlay"
                                    aria-label={`Name ${q.label} on cards`}
                                    title={q.kind === 'bool'
                                        ? 'Name this question, and its Yes and No, for the cards'
                                        : 'Name this question for the cards'}
                                    onclick={() => startNaming(q)}
                                >
                                    <!-- A tick-box has no letter to show: just the
                                         pencil, for its Yes and No words. -->
                                    {#if q.kind !== 'bool'}{shortName(q, labels)}{/if}
                                    <Pencil class="size-3" />
                                </button>
                            {/if}
                            <span class="text-xs text-ink">{q.label}</span>
                            {#if KIND_NOTE[q.kind]}
                                <span class="meta shrink-0">{KIND_NOTE[q.kind]}</span>
                            {/if}
                        </span>
                        {#if q.kind === 'text'}
                            <span class="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <input
                                    type="search"
                                    class="field h-7 w-44 px-2 text-xs"
                                    placeholder="Filter: answer contains…"
                                    aria-label={`Filter Unassigned by ${q.label}`}
                                    value={filters.texts[q.id] ?? ''}
                                    oninput={(e) =>
                                        setFilters(setText(filters, q.id, e.currentTarget.value))}
                                />
                                <span class="meta tnum">
                                    {answeredInPool(q.id)} of {unassigned.length} answered
                                </span>
                            </span>
                        {:else}
                            <span class="flex flex-wrap items-center gap-1.5">
                                {#each q.options as o (o.code)}
                                    {@const picked =
                                        filters.answers[q.id]?.includes(o.label) ?? false}
                                    <!-- Real buttons, styled as the toolbar's are: on
                                         a raised card a fill-only control has no
                                         edge and reads as plain text. -->
                                    <button
                                        type="button"
                                        class="btn btn-sm {picked
                                            ? 'btn-outline-accent bg-accent/20'
                                            : 'btn-outline hover:bg-overlay'}"
                                        aria-pressed={picked}
                                        title={picked
                                            ? 'Stop filtering by this answer'
                                            : 'Bring unassigned people who gave this answer to the top'}
                                        onclick={() => setFilters(toggleAnswer(filters, q.id, o.label))}
                                    >
                                        {optionText(q, o.label, labels)}
                                        <span class="tnum text-ink-3">
                                            {poolCounts[q.id]?.[o.label] ?? 0}
                                        </span>
                                    </button>
                                {/each}
                            </span>
                        {/if}
                        <label class="ml-auto flex shrink-0 items-center gap-2">
                            <input
                                type="checkbox"
                                class="checkbox"
                                checked={shownIds.includes(q.id)}
                                onchange={() => toggleQuestion(q.id)}
                            />
                            <span class="text-xs text-ink-3">Show on cards</span>
                        </label>
                    </li>
                {/each}
            </ul>
        </section>
    {/if}

    <!-- Beside the answers rather than on each project row, so every filter
         lives in one place and works one way. -->
    {#if projectRows.length > 0}
        <section class="card card-raised flex flex-col gap-3 p-3">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                <h3 class="m-0 meta">Project preferences</h3>
                <label class="ml-auto flex shrink-0 items-center gap-2">
                    <input
                        type="checkbox"
                        class="checkbox"
                        checked={showPreferences}
                        onchange={toggleShowPreferences}
                    />
                    <span class="text-xs text-ink-3">Show on cards</span>
                </label>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                {#each projectRows as p (p.id)}
                    {@const picked = filters.projects.includes(p.id)}
                    <button
                        type="button"
                        class="btn btn-sm {picked
                            ? 'btn-outline-accent bg-accent/20'
                            : 'btn-outline hover:bg-overlay'}"
                        aria-pressed={picked}
                        title={picked
                            ? 'Stop filtering by this project'
                            : 'Bring unassigned people who prefer this project to the top'}
                        onclick={() => setFilters(toggleProject(filters, p.id))}
                    >
                        <span class="font-semibold tnum">{p.number}</span>
                        {p.title}
                        <span class="tnum text-ink-3">{poolPreferenceCounts[p.id] ?? 0}</span>
                    </button>
                {/each}
            </div>
        </section>
    {/if}

    <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section class="card card-raised flex min-w-0 flex-col gap-4 p-3">
            <h3 class="m-0 meta">Projects</h3>
            {#if projectRows.length === 0}
                <p class="m-0 text-xs text-ink-3">No projects have been approved yet.</p>
            {:else}
                <div class="flex flex-col divide-y divide-line">
                    {#each projectRows as p (p.id)}
                        {@const projectTeams = teamsByProject[p.id] ?? []}
                        <div class="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                            <div class="flex items-center gap-2">
                                <span class="badge badge-neutral tnum shrink-0">{p.number}</span>
                                <span class="truncate text-sm font-semibold text-ink">{p.title}</span
                                >
                                <span class="meta shrink-0">
                                    {p.interested}
                                    {p.interested === 1 ? 'wants in' : 'want in'}
                                </span>
                            </div>

                            <div class="flex flex-wrap items-stretch gap-3">
                                {#each projectTeams as t (t.key)}
                                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                                    <section
                                        ondragover={(e) => dragOver(e, t.key)}
                                        ondragleave={() => dragLeave(t.key)}
                                        ondrop={(e) => drop(e, t.key)}
                                        class="card flex w-64 flex-col"
                                        class:border-accent={dropTarget === t.key}
                                    >
                                        <header
                                            class="flex items-center gap-1 border-b border-line px-2 py-1"
                                        >
                                            {#if editingKey === t.key}
                                                <input
                                                    type="text"
                                                    required
                                                    minlength="1"
                                                    maxlength="255"
                                                    autofocus
                                                    bind:value={editName}
                                                    onkeydown={(e) => {
                                                        if (e.key === 'Enter') commitEdit(t.key);
                                                        if (e.key === 'Escape') editingKey = null;
                                                    }}
                                                    class="field h-6 min-w-0 flex-1 px-1"
                                                />
                                                <button
                                                    type="button"
                                                    class="shrink-0 text-ink-3 hover:text-success-ink"
                                                    aria-label="Save name"
                                                    title="Save name"
                                                    onclick={() => commitEdit(t.key)}
                                                >
                                                    <Check class="size-3" />
                                                </button>
                                                <button
                                                    type="button"
                                                    class="shrink-0 text-ink-3 hover:text-danger-ink"
                                                    aria-label="Cancel rename"
                                                    title="Cancel"
                                                    onclick={() => (editingKey = null)}
                                                >
                                                    <X class="size-3" />
                                                </button>
                                            {:else}
                                                <span
                                                    class="min-w-0 flex-1 truncate text-xs font-bold text-ink"
                                                >
                                                    {t.name}
                                                </span>
                                                <span class="meta shrink-0">{t.memberIds.length}</span
                                                >
                                                {#if !locked}
                                                    <button
                                                        type="button"
                                                        class="shrink-0 text-ink-3 hover:text-accent-ink"
                                                        aria-label={`Rename ${t.name}`}
                                                        title="Rename"
                                                        onclick={() => startEdit(t.key, t.name)}
                                                    >
                                                        <Pencil class="size-3" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        class="shrink-0 text-ink-3 hover:text-danger-ink"
                                                        aria-label={`Delete ${t.name}`}
                                                        title="Delete"
                                                        onclick={() => removeTeam(t.key, t.name)}
                                                    >
                                                        <Trash2 class="size-3" />
                                                    </button>
                                                {/if}
                                            {/if}
                                        </header>
                                        <div class="flex min-h-16 flex-1 flex-col gap-1 p-2">
                                            {#if t.memberIds.length === 0}
                                                <p class="m-0 text-xs text-ink-3">
                                                    {locked
                                                        ? 'Nobody on this team.'
                                                        : 'Drop a participant here.'}
                                                </p>
                                            {:else}
                                                {#each t.memberIds as id (id)}
                                                    {@const member = peopleById.get(id)}
                                                    {#if member}
                                                        {@render personRow(
                                                            member,
                                                            t.key,
                                                            p.id,
                                                            p.number
                                                        )}
                                                    {/if}
                                                {/each}
                                            {/if}
                                        </div>
                                    </section>
                                {/each}

                                {#if projectTeams.length === 0 && p.interested === 0}
                                    <p class="m-0 self-center text-xs text-ink-3 italic">
                                        Nobody picked this project.
                                    </p>
                                {/if}

                                {#if !locked}
                                    <button
                                        type="button"
                                        class="btn btn-sm btn-ghost h-full"
                                        title={projectTeams.length === 0
                                            ? 'Add the first team for this project'
                                            : 'Add another team for this project'}
                                        onclick={() => addTeam(p.id)}
                                    >
                                        {projectTeams.length === 0 ? '+ Add Team' : '+'}
                                    </button>
                                {/if}
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
            class="card card-raised flex max-h-[calc(100vh-8rem)] flex-col gap-3 p-3 lg:sticky
                   lg:top-4"
            class:border-accent={dropTarget === POOL}
        >
            <h3 class="m-0 meta tnum">
                Unassigned ({unassigned.length}){filtering
                    ? ` · ${pool.matching.length} match`
                    : ''}
            </h3>
            {#if filtering}
                <div class="flex flex-wrap items-center gap-1.5">
                    {#each activeFilters as f (f.key)}
                        <button
                            type="button"
                            class="btn btn-sm btn-outline-accent bg-accent/20"
                            title={`Remove filter: ${f.title}`}
                            onclick={f.remove}
                        >
                            {f.text}
                            <X class="size-3" />
                        </button>
                    {/each}
                    <button
                        type="button"
                        class="btn btn-sm btn-quiet"
                        onclick={() => setFilters(NO_FILTERS)}
                    >
                        Reset filters
                    </button>
                </div>
            {/if}
            {#if unassigned.length === 0}
                <p class="m-0 text-xs text-ink-3">Every confirmed participant is on a team.</p>
            {:else}
                <!-- `scroll-visible`: a hundred people overflow this column,
                     and a scrollbar macOS hides until hover hides that too. -->
                <div class="scroll-visible flex min-h-0 flex-col gap-1 pr-1">
                    {#if filtering && pool.matching.length === 0}
                        <p class="m-0 text-xs text-ink-3">
                            Nobody unassigned matches these filters.
                        </p>
                    {/if}
                    {#each pool.matching as person (person.id)}
                        {@render personRow(person, POOL, null, null)}
                    {/each}
                    <!-- Greyed rather than hidden: see `matchesFirst`. Still
                         draggable, and full strength under the pointer. -->
                    {#if pool.rest.length > 0}
                        <p class="m-0 meta tnum pt-2">Not matching ({pool.rest.length})</p>
                        {#each pool.rest as person (person.id)}
                            <div class="opacity-50 transition-opacity hover:opacity-100">
                                {@render personRow(person, POOL, null, null)}
                            </div>
                        {/each}
                    {/if}
                </div>
            {/if}
        </section>
    </div>
</div>
