<script lang="ts">
    import MarkdownContent from './MarkdownContent.svelte';

    let {
        id,
        name,
        value = '',
        rows = 8,
        placeholder = '',
        required = false,
        maxlength,
    }: {
        /** Target for an external `<label for=…>`. Without it a surrounding label
         *  would bind to the Write tab — buttons are labelable too — instead of
         *  the textarea. */
        id?: string;
        name: string;
        value?: string;
        rows?: number;
        placeholder?: string;
        required?: boolean;
        maxlength?: number;
    } = $props();

    let text = $state(value);
    let mode: 'write' | 'preview' = $state('write');
</script>

<div class="flex flex-col gap-2">
    <div class="flex gap-1">
        <button
            type="button"
            onclick={() => (mode = 'write')}
            class="btn btn-sm {mode === 'write' ? 'btn-solid' : 'btn-ghost'}"
        >
            Write
        </button>
        <button
            type="button"
            onclick={() => (mode = 'preview')}
            class="btn btn-sm {mode === 'preview' ? 'btn-solid' : 'btn-ghost'}"
        >
            Preview
        </button>
    </div>

    <!--
      Both the textarea and the preview stay mounted at all times (visibility
      toggled via `hidden`, not `{#if}`) so the field is always present in the
      form when it's submitted, regardless of which tab is active.
    -->
    <textarea
        {id}
        {name}
        bind:value={text}
        {rows}
        {placeholder}
        {required}
        {maxlength}
        class="border border-line bg-surface px-3 py-2 font-mono text-sm
               text-ink focus:border-accent focus:outline-none
               {mode === 'write' ? '' : 'hidden'}"
    ></textarea>

    <div
        class="border border-line bg-surface px-3 py-2
               text-sm text-ink {mode === 'preview' ? '' : 'hidden'}"
        style="min-height: {rows * 1.5}rem"
    >
        {#if text.trim()}
            <MarkdownContent content={text} />
        {:else}
            <p class="m-0 text-ink-3">Nothing to preview yet.</p>
        {/if}
    </div>

    <p class="m-0 text-[10px] text-ink-3">Markdown supported.</p>
</div>
