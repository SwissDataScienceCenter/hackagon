<script lang="ts">
    import Check from 'lucide-svelte/icons/check';
    import Copy from 'lucide-svelte/icons/copy';

    let {
        value,
        label,
        copyLabel = 'Copy'
    }: {
        /** The text to hand over. Shown in full, not summarised. */
        value: string;
        /** Accessible name for the field. Not drawn — the caller writes its own caption. */
        label: string;
        copyLabel?: string;
    } = $props();

    let input: HTMLInputElement | undefined = $state();
    let copied = $state(false);
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Selecting the text is the fallback, and it is not a theoretical one:
    // `navigator.clipboard` exists only in a secure context, so it is there on
    // localhost and on https and absent on a plain-http deployment. Rather than
    // branch on that, the field is always a real selectable input — so worst
    // case the button does nothing visible and ⌘C still works on the selection.
    async function copy() {
        input?.select();
        try {
            await navigator.clipboard.writeText(value);
            copied = true;
            clearTimeout(timer);
            // Long enough to read, short enough that the button is not still
            // claiming success by the time a second link is copied.
            timer = setTimeout(() => (copied = false), 2000);
        } catch {
            // The selection is the answer. Saying "copy failed" would be worse
            // than the text sitting selected and ready for ⌘C.
        }
    }
</script>

<div class="flex flex-col gap-1 sm:flex-row sm:items-center">
    <!-- readonly, not disabled: a disabled input cannot be selected, which
         removes the fallback the whole control leans on. -->
    <input
        bind:this={input}
        type="text"
        {value}
        readonly
        aria-label={label}
        class="field min-w-0 flex-1"
        onclick={() => input?.select()}
    />
    <button type="button" class="btn btn-sm btn-outline shrink-0" onclick={copy}>
        {#if copied}
            <Check class="h-3 w-3 shrink-0" aria-hidden="true" />
            Copied
        {:else}
            <Copy class="h-3 w-3 shrink-0" aria-hidden="true" />
            {copyLabel}
        {/if}
    </button>
</div>
