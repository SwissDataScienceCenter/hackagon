<!-- An ⓘ button that opens an explanation in a modal. Place it right after the
     heading or control it explains; the text comes from
     $lib/content/help/<topic>.md, so wording changes never touch a page.

     Built on `<dialog>` opened with `showModal()`, like ConfirmDialog: the page
     behind is inert, focus stays inside, Esc closes, and screen readers
     announce it as a dialog. A click on the backdrop closes it too. -->
<script lang="ts">
    import Info from 'lucide-svelte/icons/info';
    import X from 'lucide-svelte/icons/x';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import { HELP } from '$lib/content/help';

    let {
        topic,
        title,
    }: {
        /** Which help text to show: `$lib/content/help/<topic>.md`. */
        topic: string;
        /** The dialog's heading, and the button's accessible name as "About <title>". */
        title: string;
    } = $props();

    const id = $props.id();
    let dialog: HTMLDialogElement;

    // help.test.ts makes a missing file a test failure; this only keeps a
    // dialog that slipped through from opening empty.
    const text = $derived(HELP[topic] ?? `_No help text for “${topic}” yet._`);
</script>

<button
    type="button"
    onclick={() => dialog.showModal()}
    aria-label="About {title}"
    title="About {title}"
    class="btn btn-quiet btn-icon btn-sm text-ink-3 hover:text-info-ink"
>
    <Info class="h-3.5 w-3.5" aria-hidden="true" />
</button>

<dialog
    bind:this={dialog}
    aria-labelledby="{id}-title"
    onclick={(e) => {
        if (e.target === dialog) dialog.close();
    }}
    class="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-0
           text-ink shadow-lg backdrop:bg-scrim"
>
    <div class="flex flex-col gap-3 p-4">
        <div class="flex items-start justify-between gap-3">
            <h2 id="{id}-title" class="m-0 text-section">{title}</h2>
            <button
                type="button"
                onclick={() => dialog.close()}
                aria-label="Close"
                class="btn btn-quiet btn-icon btn-sm -mr-1 -mt-1"
            >
                <X class="h-4 w-4" aria-hidden="true" />
            </button>
        </div>
        <div class="font-sans text-sm text-ink-2">
            <!-- Breaks off: the help files are wrapped by the formatter, not
                 by whoever wrote them. -->
            <MarkdownContent content={text} breaks={false} />
        </div>
        <div class="flex justify-end pt-1">
            <button type="button" onclick={() => dialog.close()} class="btn btn-sm btn-ghost">
                Close
            </button>
        </div>
    </div>
</dialog>
