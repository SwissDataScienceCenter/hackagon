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
    <!-- Chips, not buttons: this picks which pane is showing, and a solid accent
         would both read as an action and compete with the form's real submit. -->
    <div class="flex gap-1">
        <button
            type="button"
            onclick={() => (mode = 'write')}
            aria-pressed={mode === 'write'}
            class="chip {mode === 'write' ? 'chip-active' : ''}"
        >
            Write
        </button>
        <button
            type="button"
            onclick={() => (mode = 'preview')}
            aria-pressed={mode === 'preview'}
            class="chip {mode === 'preview' ? 'chip-active' : ''}"
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
        class="field field-area {mode === 'write' ? '' : 'hidden'}"
    ></textarea>

    <!-- The same box as the textarea it replaces, by construction rather than by
         coincidence: switching panes must not move the frame, so the preview
         takes `field field-area` too instead of re-spelling its padding. -->
    <div
        class="field field-area {mode === 'preview' ? '' : 'hidden'}"
        style="min-height: {rows * 1.5}rem"
    >
        {#if text.trim()}
            <MarkdownContent content={text} />
        {:else}
            <p class="m-0 text-ink-3">Nothing to preview yet.</p>
        {/if}
    </div>

    <p class="m-0 text-xs text-ink-3">Markdown supported.</p>
</div>
