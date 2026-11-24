<!-- A question that needs an answer before going on — the app's own
     `confirm()`. The native one cannot be styled, says "localhost:8081 says",
     and can only offer "OK"; this one names its action ("Delete team") and
     looks like the rest of the app.

     Built on `<dialog>` opened with `showModal()`, which brings what a modal
     needs for free: the page behind is inert, focus stays inside, Esc cancels,
     and screen readers announce it as a dialog. One instance per page; call
     `ask()` through `bind:this` and await the answer. -->
<script lang="ts">
    import { tick } from 'svelte';

    type Question = {
        title: string;
        message: string;
        /** What the confirming button says — the action, never "OK". */
        confirmLabel: string;
        /**
         * What the dismissing button says, "Cancel" unless given. Named when the
         * action is itself a cancel — "Cancel" beside "Cancel registration"
         * leaves the reader to guess which one keeps things as they are.
         */
        cancelLabel?: string;
        /** Red confirm button, for something that cannot simply be undone. */
        danger?: boolean;
        /**
         * Text the reader must type before the confirm button unlocks, e.g. a
         * hackathon's name. For what cannot be undone at all, where a click
         * through on autopilot would cost too much.
         */
        typeToConfirm?: string;
    };

    let dialog: HTMLDialogElement;
    let typedInput: HTMLInputElement | undefined = $state();
    let current: Question | null = $state(null);
    let typed = $state('');
    let settle: ((answer: boolean) => void) | null = null;

    // Exact, as GitHub does it, but blind to stray spaces at either end: a
    // pasted name often brings one along, and it is not a sign of carelessness.
    const unlocked = $derived.by(() => {
        const expected = current?.typeToConfirm;

        return expected === undefined || typed.trim() === expected.trim();
    });

    /** Shows the question; resolves `true` on confirm, `false` otherwise. */
    export function ask(question: Question): Promise<boolean> {
        // A question still open is answered "no" rather than left hanging.
        settle?.(false);
        current = question;
        typed = '';
        dialog.showModal();
        // The field exists only once the question has rendered. Focus goes
        // there rather than to Cancel: typing is the next thing to do, and the
        // confirm button stays locked until it is done.
        if (question.typeToConfirm !== undefined) {
            void tick().then(() => typedInput?.focus());
        }

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
            {#if current.typeToConfirm !== undefined}
                <div class="flex flex-col gap-1.5">
                    <label for="confirm-dialog-typed" class="font-sans text-sm text-ink-2">
                        Type <strong class="font-semibold text-ink">{current.typeToConfirm}</strong>
                        to confirm.
                    </label>
                    <!-- Enter confirms, as a form would, but only once unlocked. -->
                    <input
                        id="confirm-dialog-typed"
                        type="text"
                        autocomplete="off"
                        spellcheck="false"
                        bind:this={typedInput}
                        bind:value={typed}
                        onkeydown={(e) => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            if (unlocked) answer(true);
                        }}
                        class="field px-3"
                    />
                </div>
            {/if}
            <div class="flex justify-end gap-2 pt-1">
                <!-- First, so it has the focus: a slip of Enter cancels. -->
                <button type="button" class="btn btn-sm btn-ghost" onclick={() => answer(false)}>
                    {current.cancelLabel ?? 'Cancel'}
                </button>
                <button
                    type="button"
                    class="btn btn-sm {current.danger ? 'btn-danger-solid' : 'btn-solid'}"
                    disabled={!unlocked}
                    onclick={() => answer(true)}
                >
                    {current.confirmLabel}
                </button>
            </div>
        </div>
    {/if}
</dialog>
