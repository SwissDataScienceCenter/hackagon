<script lang="ts">
    import { enhance } from '$app/forms';
    import { Check, Eraser, GripVertical, Pencil, Sparkles, Trash2, X } from 'lucide-svelte';
    import ManageHubBackLink from '$lib/components/hackathon/ManageHubBackLink.svelte';
    import { initialsOf, suggestDistribution } from '$lib/utils/teamDistribution';
    import type { ActionData, PageData } from './$types';

    type Person = {
        id: string;
        name: string;
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
    });

    let draggedId: string | null = $state(null);
    let draggedFrom: string | null = $state(null);
    let dropTarget: string | null = $state(null);
    let pending: boolean = $state(false);

    let saveForm: HTMLFormElement;
    let savePayload: HTMLInputElement;

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

    const assignedCount = $derived(teams.reduce((n, t) => n + t.memberIds.length, 0));

    /** What Save would write, compared against what the server last reported. */
    const changes = $derived.by(() => {
        const base = fromServer(data.projectRows);
        const nameBefore = new Map(base.map((t) => [t.key, t.name]));
        const alive = new Set(teams.map((t) => t.key));

        const added = teams.filter((t) => t.id === null).length;
        const removed = base.filter((t) => !alive.has(t.key)).length;
        const renamed = teams.filter(
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
        if (name.length < 3) return;
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

    function suggest() {
        const plan = suggestDistribution(
            projectRows.map((p) => ({
                id: p.id,
                title: p.title,
                teams: p.teams.map((t) => ({
                    id: t.id,
                    name: t.name,
                    memberIds: t.members.map((m) => m.id)
                }))
            })),
            data.unassigned,
            { max: TEAM_MAX }
        );

        // Keep inventing keys past the ones the plan handed out, so a team added
        // afterwards cannot collide with one of them.
        invented = plan.filter((t) => t.id === null).length;
        editingKey = null;
        teams = plan;
    }

    function discard() {
        teams = fromServer(data.projectRows);
        editingKey = null;
    }

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
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        draggable="true"
        ondragstart={(e) => startDrag(e, person.id, from)}
        ondragend={endDrag}
        class="flex cursor-grab items-center gap-1.5 rounded-card border border-line bg-raised
               px-2 py-1 active:cursor-grabbing"
        class:opacity-40={draggedId === person.id}
    >
        <GripVertical class="size-3 shrink-0 text-ink-3" />
        <div class="flex min-w-0 flex-1 flex-col">
            <span class="min-w-0 truncate text-xs text-ink">{person.name}</span>
            {#if person.preferredNumbers.length > 0}
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
        </div>
        {#if projectId !== null && !matches}
            <span
                class="shrink-0 text-[0.65rem] text-warning-ink"
                title="This project is not one of their preferences"
            >
                ?
            </span>
        {/if}
        {#if from !== POOL}
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
        <p class="m-0 text-xs text-ink-3">
            Drag a participant onto a team to assign them. Everyone belongs to at most one team,
            and no team holds more than {TEAM_MAX}. Nothing is written until you save.
        </p>
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

    <div class="flex flex-wrap items-center gap-3">
        <button
            type="button"
            class="btn btn-sm"
            disabled={pending || unassigned.length === 0}
            onclick={suggest}
        >
            <Sparkles class="size-3" />
            Suggest teams
        </button>
        <button
            type="button"
            class="btn btn-sm btn-ghost"
            disabled={pending || assignedCount === 0}
            onclick={clearAll}
        >
            <Eraser class="size-3" />
            Clear all
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
                disabled={pending || changes.total === 0}
                onclick={discard}
            >
                Discard
            </button>
            <button
                type="button"
                class="btn btn-sm"
                disabled={pending || changes.total === 0}
                onclick={save}
            >
                Save
            </button>
        </div>
    </div>

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
                                {#if !p.isApproved}
                                    <span class="meta shrink-0">(Proposed)</span>
                                {/if}
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
                                                    minlength="3"
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
                                        </header>
                                        <div class="flex min-h-16 flex-1 flex-col gap-1 p-2">
                                            {#if t.memberIds.length === 0}
                                                <p class="m-0 text-xs text-ink-3">
                                                    Drop a participant here.
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
            <h3 class="m-0 meta">Unassigned ({unassigned.length})</h3>
            {#if unassigned.length === 0}
                <p class="m-0 text-xs text-ink-3">Every confirmed participant is on a team.</p>
            {:else}
                <div class="flex min-h-0 flex-col gap-1 overflow-y-auto">
                    {#each unassigned as person (person.id)}
                        {@render personRow(person, POOL, null, null)}
                    {/each}
                </div>
            {/if}
        </section>
    </div>
</div>
