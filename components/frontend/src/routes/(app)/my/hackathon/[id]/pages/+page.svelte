<script lang="ts">
    import { enhance } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import { resolve } from '$app/paths';
    import {
        ChevronDown,
        ChevronUp,
        Eye,
        EyeOff,
        FileText,
        GripVertical,
        Pencil,
        Plus,
    } from 'lucide-svelte';
    import ManageHubBackLink from '$lib/components/hackathon/ManageHubBackLink.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Row = PageData['pages'][number];

    /**
     * The list as shown, which during a drag is ahead of the server: rows are
     * moved locally as the pointer passes over them, and the new order is sent
     * once, on drop.
     *
     * A writable `$derived` rather than plain state, so it is the server's order
     * again the moment a load returns one — a reorder the backend refuses snaps
     * back to the truth rather than leaving the screen quietly disagreeing with
     * the database.
     */
    let rows: Row[] = $derived([...data.pages]);

    let draggingId = $state<string | null>(null);
    // Whether the drag ended on a row rather than being abandoned or cancelled.
    // `dragend` fires either way, and only the drop should be saved.
    let dropped = false;
    let pending = $state(false);

    let orderForm: HTMLFormElement;
    let orderIds: HTMLInputElement;

    function startDrag(event: DragEvent, id: string) {
        draggingId = id;
        dropped = false;
        if (event.dataTransfer) {
            event.dataTransfer.setData('text/plain', id);
            event.dataTransfer.effectAllowed = 'move';
        }
    }

    // The reorder itself. Moving the row under the pointer rather than drawing an
    // insertion line means what you see mid-drag is exactly what gets saved.
    function dragOver(event: DragEvent, overId: string) {
        if (draggingId === null) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        if (draggingId === overId) return;

        const from = rows.findIndex((r) => r.id === draggingId);
        const to = rows.findIndex((r) => r.id === overId);
        if (from < 0 || to < 0) return;

        const next = [...rows];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved!);
        rows = next;
    }

    function drop(event: DragEvent) {
        if (draggingId === null) return;
        event.preventDefault();
        dropped = true;

        // `rows` is already in its final order — dragOver put it there. A drag
        // that ended where it began is not a write: picking a row up and setting
        // it back down should cost nothing.
        const ids = rows.map((r) => r.id);
        if (ids.every((id, i) => id === data.pages[i]?.id)) return;

        orderIds.value = ids.join(',');
        orderForm.requestSubmit();
    }

    function endDrag() {
        draggingId = null;
        // Abandoned mid-air: put back what the pointer rearranged on the way.
        if (!dropped) rows = [...data.pages];
        dropped = false;
    }
</script>

<!-- One hidden form for the whole list rather than one per row: `SetOrder` takes
     the entire sequence in a single call, which is also what makes a drop one
     write instead of a run of swaps. -->
<form
    method="POST"
    action="?/setOrder"
    class="hidden"
    bind:this={orderForm}
    use:enhance={() => {
        pending = true;
        return async ({ result, update }) => {
            await update();
            // A refusal leaves `rows` showing an order the database never took.
            // Refetching is what corrects it: the load returns the real order,
            // and `rows` — a derived — is that order again.
            if (result.type === 'failure') await invalidateAll();
            pending = false;
        };
    }}
>
    <input type="hidden" name="pageIds" bind:this={orderIds} />
</form>

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches the other member pages). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-0.5">
            <ManageHubBackLink hackathonId={data.hackathonId} />
            <h2 class="m-0 text-title text-ink">Manage Pages</h2>
            <span class="text-xs text-ink-3">
                {data.pages.length === 1 ? '1 page' : `${data.pages.length} pages`}
            </span>
        </div>
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/pages/new`)}
            class="btn btn-sm btn-solid no-underline"
        >
            <Plus class="h-3 w-3 shrink-0" aria-hidden="true" />
            New page
        </a>
    </div>

    <!-- A page picks up a phase badge once a phase links to it, but that link is
         set from the phase's own edit form, not here — this just points there. -->
    <p class="m-0 text-xs text-ink-3">
        Want a page tied to a phase? Link it from
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/timeline/manage`)}
            class="font-semibold text-accent-ink no-underline hover:underline"
        >
            that phase's edit form
        </a>
        on Manage Timeline.
    </p>

    {#if form?.message}
        <p class="m-0 text-sm text-danger-ink" role="alert">{form.message}</p>
    {/if}

    {#if data.pages.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            No pages yet. Add one to give participants something to read.
        </p>
    {:else}
        <!-- Says what the arrows are for as well as the drag, because dragging is
             the one way through this list a keyboard cannot take. -->
        <p class="m-0 text-xs text-ink-3">
            Drag a page by its handle to reorder, or use the arrows.
        </p>

        <!-- The drop target covers the gaps between rows too: a drop that lands
             between two of them is a drop the user meant, and without this it
             would count as abandoned and spring back. -->
        <ol
            class="m-0 flex list-none flex-col gap-2 p-0 transition-opacity"
            class:opacity-60={pending}
            ondragover={(e) => {
                if (draggingId !== null) e.preventDefault();
            }}
            ondrop={drop}
        >
            {#each rows as page, index (page.id)}
                <li
                    draggable="true"
                    ondragstart={(e) => startDrag(e, page.id)}
                    ondragover={(e) => dragOver(e, page.id)}
                    ondrop={drop}
                    ondragend={endDrag}
                    class="card card-raised box-border w-full cursor-grab px-5 py-4
                           transition-opacity active:cursor-grabbing"
                    class:opacity-40={draggingId === page.id}
                >
                    <div class="flex items-center gap-2">
                        <!-- Pointer affordance only. The arrows beside it do the
                             same job for a keyboard, so the handle itself needs no
                             announcement of its own. -->
                        <GripVertical
                            class="size-4 shrink-0 text-ink-3"
                            aria-hidden="true"
                        />
                        <div class="flex shrink-0 flex-col">
                            <form method="POST" action="?/moveUp" use:enhance>
                                <input type="hidden" name="pageId" value={page.id} />
                                <button
                                    type="submit"
                                    disabled={index === 0 || pending}
                                    aria-label="Move {page.title} up"
                                    class="btn btn-icon btn-sm btn-quiet disabled:opacity-30"
                                >
                                    <ChevronUp class="h-3 w-3" aria-hidden="true" />
                                </button>
                            </form>
                            <form method="POST" action="?/moveDown" use:enhance>
                                <input type="hidden" name="pageId" value={page.id} />
                                <button
                                    type="submit"
                                    disabled={index === rows.length - 1 || pending}
                                    aria-label="Move {page.title} down"
                                    class="btn btn-icon btn-sm btn-quiet disabled:opacity-30"
                                >
                                    <ChevronDown class="h-3 w-3" aria-hidden="true" />
                                </button>
                            </form>
                        </div>
                        <!-- Title, its controls and the excerpt share one column
                             so the excerpt lines up under the title rather than
                             under the drag handle. -->
                        <div class="flex min-w-0 flex-1 flex-col gap-1">
                            <div class="flex flex-wrap items-center gap-2">
                                <h3 class="m-0 text-sm leading-snug text-ink">
                                    {page.title}
                                </h3>
                                <form method="POST" action="?/toggleVisible" use:enhance>
                                    <input type="hidden" name="pageId" value={page.id} />
                                    <input
                                        type="hidden"
                                        name="visible"
                                        value={!page.visible}
                                    />
                                    <button
                                        type="submit"
                                        aria-label={page.visible
                                            ? `Hide ${page.title}`
                                            : `Show ${page.title}`}
                                        class="btn btn-icon btn-sm btn-quiet shrink-0"
                                    >
                                        {#if page.visible}
                                            <Eye
                                                class="h-4 w-4 text-success-ink"
                                                aria-hidden="true"
                                            />
                                        {:else}
                                            <EyeOff
                                                class="h-4 w-4 text-ink-3"
                                                aria-hidden="true"
                                            />
                                        {/if}
                                    </button>
                                </form>
                                {#if page.phaseName}
                                    <!-- Which phase points here, not a state of the
                                         page: neutral rather than one of the status
                                         hues. -->
                                    <span class="badge badge-neutral">
                                        {page.phaseName}
                                    </span>
                                {/if}
                                <!-- View is the excerpt's way out — the whole page,
                                     rendered as a participant gets it. Quiet beside
                                     Edit, which is what this screen is for. -->
                                <div class="ml-auto flex items-center gap-3">
                                    <a
                                        href={resolve(`/my/hackathon/${data.hackathonId}/pages/${page.id}`)}
                                        class="text-xs font-semibold text-ink-3
                                               no-underline hover:text-ink hover:underline"
                                    >
                                        <FileText
                                            class="inline h-3 w-3 shrink-0"
                                            aria-hidden="true"
                                        />
                                        View<span class="sr-only"> {page.title}</span>
                                    </a>
                                    <a
                                        href={resolve(`/my/hackathon/${data.hackathonId}/pages/${page.id}/edit`)}
                                        class="text-xs font-semibold text-accent-ink
                                               no-underline hover:underline"
                                    >
                                        <Pencil
                                            class="inline h-3 w-3 shrink-0"
                                            aria-hidden="true"
                                        />
                                        Edit<span class="sr-only"> {page.title}</span>
                                    </a>
                                </div>
                            </div>
                            <!-- Two lines and no more: what the list is for is
                                 telling pages apart, and a row that grows with its
                                 page stops being scannable. Sans, because this is
                                 the one thing here read as a sentence. -->
                            {#if page.excerpt}
                                <p
                                    class="m-0 line-clamp-2 font-sans text-xs
                                           leading-snug text-ink-2"
                                >
                                    {page.excerpt}
                                </p>
                            {:else}
                                <p class="m-0 text-xs leading-snug text-ink-3">
                                    {page.hasContent
                                        ? 'Nothing to quote here'
                                        : 'No content yet'}
                                </p>
                            {/if}
                        </div>
                    </div>
                </li>
            {/each}
        </ol>
    {/if}
</div>
