<script lang="ts">
    import { resolve } from '$app/paths';
    import { enhance } from '$app/forms';
    import Select from '$lib/components/forms/Select.svelte';
    import { GripVertical, X } from 'lucide-svelte';
    import type { PageData } from './$types';

    type Person = { id: string; name: string };

    let { data }: { data: PageData } = $props();

    const slug = $derived(data.hackathonId);
    const teams = $derived(data.teams);
    const unassigned = $derived(data.unassigned);

    // Drop target id for the unassigned pool; team ids are used as-is.
    const POOL = 'pool';

    let message: string = $state('');
    let draggedId: string | null = $state(null);
    let draggedFrom: string | null = $state(null);
    let dropTarget: string | null = $state(null);
    let pending: boolean = $state(false);

    let moveForm: HTMLFormElement;
    let moveUserId: HTMLInputElement;
    let moveToTeamId: HTMLInputElement;

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

    // Single hidden form for every move, so drag-and-drop and the buttons below
    // share one enhanced submit path.
    function move(userId: string, toTeamId: string) {
        moveUserId.value = userId;
        moveToTeamId.value = toTeamId;
        moveForm.requestSubmit();
    }

    function failureMessage(result: unknown, fallback: string) {
        return (result as { data?: { message?: string } })?.data?.message ?? fallback;
    }
</script>

<form
    method="POST"
    action="?/move"
    class="hidden"
    bind:this={moveForm}
    use:enhance={() => {
        pending = true;
        message = '';
        return async ({ result, update }) => {
            if (result.type === 'failure') {
                message = failureMessage(result, 'Could not move that participant.');
            }
            await update();
            pending = false;
        };
    }}
>
    <input type="hidden" name="userId" bind:this={moveUserId} />
    <input type="hidden" name="toTeamId" bind:this={moveToTeamId} />
</form>

{#snippet personChip(person: Person, from: string)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        draggable="true"
        ondragstart={(e) => startDrag(e, person.id, from)}
        ondragend={endDrag}
        class="flex cursor-grab items-center gap-1.5 border border-surface-200-800
               bg-surface-50-950 px-2 py-1 text-xs text-surface-950-50
               active:cursor-grabbing"
        class:opacity-40={draggedId === person.id}
        title="Drag onto a team to assign"
    >
        <GripVertical class="size-3 shrink-0 text-surface-400" />
        <span class="min-w-0 truncate">{person.name}</span>
        {#if from !== POOL}
            <button
                type="button"
                class="ml-0.5 text-surface-400 hover:text-error-500"
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
            <h1 class="m-0 text-lg font-bold text-surface-950-50">Teams</h1>
            <p class="m-0 text-xs text-surface-500">
                Drag a participant onto a team to assign them. Everyone belongs to at most one team.
            </p>
        </div>
        <a href={resolve(`/owner/hackathon/${slug}/teams/new`)} class="btn btn-sm preset-filled-primary">
            New Team
        </a>
    </div>

    {#if message}
        <p class="m-0 border border-error-500 px-3 py-2 text-xs text-error-500">{message}</p>
    {/if}

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <section
        ondragover={(e) => dragOver(e, POOL)}
        ondragleave={() => dragLeave(POOL)}
        ondrop={(e) => drop(e, POOL)}
        class="flex flex-col gap-3 border border-surface-200-800 bg-surface-100-900 p-3"
        class:border-primary-500={dropTarget === POOL}
    >
        <h2 class="m-0 text-xs font-semibold uppercase tracking-wide text-surface-500">
            Unassigned ({unassigned.length})
        </h2>
        {#if unassigned.length === 0}
            <p class="m-0 text-xs text-surface-400">
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

    {#if teams.length === 0}
        <p class="m-0 py-6 text-center text-sm text-surface-500">No teams yet.</p>
    {:else}
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {#each teams as t (t.id)}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <section
                    ondragover={(e) => dragOver(e, t.id)}
                    ondragleave={() => dragLeave(t.id)}
                    ondrop={(e) => drop(e, t.id)}
                    class="flex flex-col border border-surface-200-800 bg-surface-100-900"
                    class:border-primary-500={dropTarget === t.id}
                >
                    <header class="flex items-start justify-between gap-2 border-b border-surface-200-800 px-3 py-2">
                        <div class="flex min-w-0 flex-col">
                            <span class="truncate text-sm font-bold text-surface-950-50">{t.name}</span>
                            <span class="truncate text-xs text-surface-500">{t.projectTitle}</span>
                        </div>
                        <div class="flex shrink-0 items-center gap-2">
                            <a
                                href={resolve(`/owner/hackathon/${slug}/teams/${t.id}/edit`)}
                                class="btn btn-sm preset-tonal-surface"
                            >
                                Edit
                            </a>
                            <form
                                method="POST"
                                action="?/delete"
                                use:enhance={() => {
                                    message = '';
                                    return async ({ result, update }) => {
                                        if (result.type === 'failure') {
                                            message = failureMessage(result, 'Could not delete.');
                                        }
                                        await update();
                                    };
                                }}
                            >
                                <input type="hidden" name="teamId" value={t.id} />
                                <button type="submit" class="btn btn-sm preset-tonal-surface">Delete</button>
                            </form>
                        </div>
                    </header>

                    <div class="flex min-h-24 flex-1 flex-wrap content-start gap-2 p-3">
                        {#if t.members.length === 0}
                            <p class="m-0 text-xs text-surface-400">Drop a participant here.</p>
                        {:else}
                            {#each t.members as member (member.id)}
                                {@render personChip(member, t.id)}
                            {/each}
                        {/if}
                    </div>

                    {#if unassigned.length > 0}
                        <form
                            method="POST"
                            action="?/move"
                            class="flex items-center gap-2 border-t border-surface-200-800 px-3 py-2"
                            use:enhance={() => {
                                message = '';
                                return async ({ result, update }) => {
                                    if (result.type === 'failure') {
                                        message = failureMessage(result, 'Could not add member.');
                                    }
                                    await update();
                                };
                            }}
                        >
                            <input type="hidden" name="toTeamId" value={t.id} />
                            <div class="min-w-0 flex-1">
                                <Select
                                    name="userId"
                                    placeholder="Add unassigned…"
                                    options={unassigned.map((p) => ({ label: p.name, value: p.id }))}
                                />
                            </div>
                            <button type="submit" class="btn btn-sm preset-tonal-surface">Add</button>
                        </form>
                    {/if}
                </section>
            {/each}
        </div>
    {/if}
</div>
