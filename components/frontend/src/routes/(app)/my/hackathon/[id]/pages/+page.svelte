<script lang="ts">
    import { enhance } from '$app/forms';
    import { resolve } from '$app/paths';
    import { CalendarClock, ChevronDown, ChevronUp, Eye, EyeOff, Pencil, Plus, X } from 'lucide-svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Only phases with nothing to drag onto a page yet — one already linked
    // shows up as that page's badge instead, so listing it here too would
    // just be the same fact shown twice.
    const unlinkedPhases = $derived(data.phases.filter((p) => !p.pageId));

    // Drag source is a phase chip's id; drop target is the page row under the
    // cursor, tracked only to highlight it. The link itself always goes
    // through `?/linkPhase`, whether it came from a drop or the badge's ×.
    let draggedPhaseId: string | null = $state(null);
    let dropPageId: string | null = $state(null);

    let linkForm: HTMLFormElement;
    let linkPhaseId: HTMLInputElement;
    let linkPageId: HTMLInputElement;

    function linkPhase(phaseId: string, pageId: string) {
        linkPhaseId.value = phaseId;
        linkPageId.value = pageId;
        linkForm.requestSubmit();
    }

    function dragStart(event: DragEvent, phaseId: string) {
        draggedPhaseId = phaseId;
        if (event.dataTransfer) {
            event.dataTransfer.setData('text/plain', phaseId);
            event.dataTransfer.effectAllowed = 'link';
        }
    }

    function dragEnd() {
        draggedPhaseId = null;
        dropPageId = null;
    }

    function dragOver(event: DragEvent, pageId: string) {
        if (draggedPhaseId === null) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'link';
        dropPageId = pageId;
    }

    function dragLeave(pageId: string) {
        if (dropPageId === pageId) dropPageId = null;
    }

    function drop(event: DragEvent, pageId: string) {
        const phaseId = draggedPhaseId;
        dragEnd();
        if (phaseId === null) return;
        event.preventDefault();
        linkPhase(phaseId, pageId);
    }
</script>

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches the other member pages). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-0.5">
            <h2 class="m-0 text-lg font-bold text-surface-950-50">Manage Pages</h2>
            <span class="text-xs text-surface-500">
                {data.pages.length === 1 ? '1 page' : `${data.pages.length} pages`}
            </span>
        </div>
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/pages/new`)}
            class="btn btn-sm preset-filled-primary-500 no-underline"
        >
            <Plus class="h-3 w-3 shrink-0" aria-hidden="true" />
            New page
        </a>
    </div>

    <!-- Hidden: both the drop handler and a badge's × submit through this. -->
    <form method="POST" action="?/linkPhase" class="hidden" bind:this={linkForm} use:enhance>
        <input type="hidden" name="phaseId" bind:this={linkPhaseId} />
        <input type="hidden" name="pageId" bind:this={linkPageId} />
    </form>

    {#if unlinkedPhases.length > 0}
        <div class="flex flex-col gap-2">
            <span class="text-xs text-surface-500">
                A phase can have one unique page that describes it — drag it onto a
                page to link them. The phase's Timeline entry then points to that
                page; the page itself still shows in the nav regardless of phase. A
                linked page shows a badge — click the × on it to unlink.
            </span>
            <ol class="m-0 flex list-none flex-wrap gap-2 p-0">
                {#each unlinkedPhases as phase (phase.id)}
                    <li>
                        <div
                            role="button"
                            tabindex="0"
                            draggable="true"
                            ondragstart={(e) => dragStart(e, phase.id)}
                            ondragend={dragEnd}
                            class="flex cursor-grab items-center gap-1.5 border border-surface-200-800
                                   bg-surface-50-950 px-2 py-1 text-xs text-surface-950-50
                                   active:cursor-grabbing"
                            class:opacity-40={draggedPhaseId === phase.id}
                        >
                            <CalendarClock class="h-3 w-3 shrink-0 text-surface-500" aria-hidden="true" />
                            {phase.name}
                        </div>
                    </li>
                {/each}
            </ol>
        </div>
    {/if}

    {#if form?.message}
        <p class="m-0 text-sm text-error-700-300" role="alert">{form.message}</p>
    {/if}

    {#if data.pages.length === 0}
        <p class="m-0 py-6 text-center text-sm text-surface-500">
            No pages yet. Add one to give participants something to read.
        </p>
    {:else}
        <ol class="m-0 flex list-none flex-col gap-2 p-0">
            {#each data.pages as page, index (page.id)}
                <li
                    ondragover={(e) => dragOver(e, page.id)}
                    ondragleave={() => dragLeave(page.id)}
                    ondrop={(e) => drop(e, page.id)}
                    class="box-border w-full border border-surface-200-800 bg-surface-100-900
                           px-5 py-4"
                    class:border-primary-500={dropPageId === page.id}
                >
                    <div class="flex flex-wrap items-center gap-2">
                        <div class="flex shrink-0 flex-col">
                            <form method="POST" action="?/moveUp" use:enhance>
                                <input type="hidden" name="pageId" value={page.id} />
                                <button
                                    type="submit"
                                    disabled={index === 0}
                                    aria-label="Move {page.title} up"
                                    class="btn-icon btn-sm disabled:opacity-30"
                                >
                                    <ChevronUp class="h-3 w-3" aria-hidden="true" />
                                </button>
                            </form>
                            <form method="POST" action="?/moveDown" use:enhance>
                                <input type="hidden" name="pageId" value={page.id} />
                                <button
                                    type="submit"
                                    disabled={index === data.pages.length - 1}
                                    aria-label="Move {page.title} down"
                                    class="btn-icon btn-sm disabled:opacity-30"
                                >
                                    <ChevronDown class="h-3 w-3" aria-hidden="true" />
                                </button>
                            </form>
                        </div>
                        <h3 class="m-0 text-sm font-bold leading-snug text-surface-950-50">
                            {page.title}
                        </h3>
                        <form method="POST" action="?/toggleVisible" use:enhance>
                            <input type="hidden" name="pageId" value={page.id} />
                            <input type="hidden" name="visible" value={!page.visible} />
                            <button
                                type="submit"
                                aria-label={page.visible
                                    ? `Hide ${page.title}`
                                    : `Show ${page.title}`}
                                class="btn-icon btn-sm shrink-0"
                            >
                                {#if page.visible}
                                    <Eye class="h-4 w-4 text-success-700-300" aria-hidden="true" />
                                {:else}
                                    <EyeOff class="h-4 w-4 text-surface-500" aria-hidden="true" />
                                {/if}
                            </button>
                        </form>
                        {#if page.phase}
                            <span class="badge preset-tonal-primary gap-1 text-xs">
                                {page.phase.name}
                                <button
                                    type="button"
                                    onclick={() => linkPhase(page.phase!.id, '')}
                                    aria-label="Unlink {page.phase.name} from {page.title}"
                                    class="-mr-0.5 rounded-full hover:bg-black/10"
                                >
                                    <X class="h-3 w-3" aria-hidden="true" />
                                </button>
                            </span>
                        {/if}
                        <a
                            href={resolve(`/my/hackathon/${data.hackathonId}/pages/${page.id}/edit`)}
                            class="ml-auto text-xs font-semibold text-primary-700-300
                                   no-underline hover:underline"
                        >
                            <Pencil class="inline h-3 w-3 shrink-0" aria-hidden="true" />
                            Edit<span class="sr-only"> {page.title}</span>
                        </a>
                    </div>
                </li>
            {/each}
        </ol>
    {/if}
</div>
