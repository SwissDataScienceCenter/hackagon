<!-- A question that needs an answer before going on — the app's own
     `confirm()`. The native one cannot be styled, says "localhost:8081 says",
     and can only offer "OK"; this one names its action ("Delete team") and
     looks like the rest of the app.

     Built on `<dialog>` opened with `showModal()`, which brings what a modal
     needs for free: the page behind is inert, focus stays inside, Esc cancels,
     and screen readers announce it as a dialog. One instance per page; call
     `ask()` through `bind:this` and await the answer. -->
<script lang="ts">
    type Question = {
        title: string;
        message: string;
        /** What the confirming button says — the action, never "OK". */
        confirmLabel: string;
        /** Red confirm button, for something that cannot simply be undone. */
        danger?: boolean;
    };

    let dialog: HTMLDialogElement;
    let current: Question | null = $state(null);
    let settle: ((answer: boolean) => void) | null = null;

    /** Shows the question; resolves `true` on confirm, `false` otherwise. */
    export function ask(question: Question): Promise<boolean> {
        // A question still open is answered "no" rather than left hanging.
        settle?.(false);
        current = question;
        dialog.showModal();

        return new Promise((resolve) => (settle = resolve));
    }

    function answer(confirmed: boolean) {
        const resolve = settle;
        settle = null;
        dialog.close();
        resolve?.(confirmed);
    }
</script>

<!-- `close` fires for Esc too, which is a "no". A click on the backdrop lands
     on the dialog element itself, never on its content, and is a "no" as well. -->
<dialog
    bind:this={dialog}
    aria-labelledby="confirm-dialog-title"
    onclose={() => answer(false)}
    onclick={(e) => {
        if (e.target === dialog) answer(false);
    }}
    class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-0
           text-ink shadow-lg backdrop:bg-scrim"
>
    {#if current}
        <div class="flex flex-col gap-3 p-4">
            <h2 id="confirm-dialog-title" class="m-0 text-section">{current.title}</h2>
            <p class="m-0 font-sans text-sm text-ink-2">{current.message}</p>
            <div class="flex justify-end gap-2 pt-1">
                <!-- First, so it has the focus: a slip of Enter cancels. -->
                <button type="button" class="btn btn-sm btn-ghost" onclick={() => answer(false)}>
                    Cancel
                </button>
                <button
                    type="button"
                    class="btn btn-sm {current.danger ? 'btn-danger-solid' : 'btn-solid'}"
                    onclick={() => answer(true)}
                >
                    {current.confirmLabel}
                </button>
            </div>
        </div>
    {/if}
</dialog>
