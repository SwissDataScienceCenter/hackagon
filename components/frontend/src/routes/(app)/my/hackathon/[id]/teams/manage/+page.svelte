<script lang="ts">
    import { resolve } from '$app/paths';
    import { enhance } from '$app/forms';
    import { GripVertical, X } from 'lucide-svelte';
    import type { ActionData, PageData } from './$types';

    type Person = { id: string; name: string };

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const hackathonId = $derived(data.hackathonId);
    const teams = $derived(data.teams);
    const unassigned = $derived(data.unassigned);

    // Drop target id for the unassigned pool; team ids are used as-is.
    const POOL = 'pool';

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

    // Single hidden form for every move, so drag-and-drop and the unassign
    // button share one enhanced submit path.
    function move(userId: string, toTeamId: string) {
        moveUserId.value = userId;
        moveToTeamId.value = toTeamId;
        moveForm.requestSubmit();
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
            <h2 class="m-0 text-lg font-bold text-surface-950-50">Manage Teams</h2>
            <p class="m-0 text-xs text-surface-500">
                Drag a participant onto a team to assign them. Everyone belongs to at most one team.
            </p>
        </div>
        <a
            href={resolve(`/my/hackathon/${hackathonId}/teams`)}
            class="btn btn-sm preset-tonal-surface no-underline"
        >
            Back to Teams
        </a>
    </div>

    {#if form?.message}
        <p class="m-0 border border-error-500 px-3 py-2 text-xs text-error-500" role="alert">
            {form.message}
        </p>
    {/if}

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <section
        ondragover={(e) => dragOver(e, POOL)}
        ondragleave={() => dragLeave(POOL)}
        ondrop={(e) => drop(e, POOL)}
        class="flex flex-col gap-3 border border-surface-200-800 bg-surface-100-900 p-3"
        class:border-primary-500={dropTarget === POOL}
    >
        <h3 class="m-0 text-xs font-semibold uppercase tracking-wide text-surface-500">
            Unassigned ({unassigned.length})
        </h3>
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
                    <header class="border-b border-surface-200-800 px-3 py-2">
                        <span class="truncate text-sm font-bold text-surface-950-50">{t.name}</span>
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
                </section>
            {/each}
        </div>
    {/if}
</div>
