<script lang="ts">
    import MarkdownContent from './MarkdownContent.svelte';
    import { IMAGE_ACCEPT, UploadError, altFromFilename, uploadImage } from '$lib/upload';

    let {
        id,
        name,
        value = '',
        rows = 8,
        placeholder = '',
        required = false,
        maxlength,
        uploadEndpoint,
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
        /** POST target that presigns an upload and returns {uploadUrl, publicUrl}.
         *  Omit it and no upload control renders — site pages have no hackathon
         *  to file media under yet, and a button that cannot work is worse than
         *  no button. */
        uploadEndpoint?: string;
    } = $props();

    let text = $state(value);
    let mode: 'write' | 'preview' = $state('write');

    let area: HTMLTextAreaElement;
    let uploading = $state(false);
    let uploadError = $state('');

    /**
     * Insert markdown at the caret, not at the end: someone who has just
     * written "and here is the venue:" expects the image to land there.
     */
    function insertAtCaret(snippet: string) {
        const start = area?.selectionStart ?? text.length;
        const end = area?.selectionEnd ?? text.length;
        text = `${text.slice(0, start)}${snippet}${text.slice(end)}`;
        // Restore focus and put the caret after what we inserted, so a second
        // upload does not overwrite the first.
        queueMicrotask(() => {
            area?.focus();
            const at = start + snippet.length;
            area?.setSelectionRange(at, at);
        });
    }

    /**
     * Insert an uploaded image at the caret.
     *
     * The upload itself — WebP re-encoding, the presign, the direct PUT — lives
     * in `$lib/upload`, shared with every other surface that accepts a picture.
     * It started here, and being here is why nothing else had an uploader.
     */
    async function upload(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const original = input.files?.[0];
        if (!original || !uploadEndpoint) return;

        uploading = true;
        uploadError = '';
        try {
            const { publicUrl } = await uploadImage(uploadEndpoint, original);
            insertAtCaret(`![${altFromFilename(original.name)}](${publicUrl})`);
        } catch (e) {
            // The backend's message names the real limit or the rejected type.
            uploadError =
                e instanceof UploadError ? e.message : 'Could not reach the object store';
        } finally {
            uploading = false;
            // Clear it, or picking the SAME file twice fires no change event.
            input.value = '';
        }
    }
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

        {#if uploadEndpoint}
            <!-- Pushed to the right so it reads as a tool for the pane rather
                 than a third tab. A <label> wrapping a hidden input, because a
                 styled button cannot open a file picker on its own. -->
            <label
                class="btn btn-sm btn-quiet ml-auto cursor-pointer"
                class:opacity-60={uploading}
            >
                {uploading ? 'Uploading…' : 'Insert image'}
                <input
                    type="file"
                    accept={IMAGE_ACCEPT}
                    aria-label="Choose a file to insert"
                    class="hidden"
                    disabled={uploading}
                    onchange={upload}
                />
            </label>
        {/if}
    </div>

    {#if uploadError}
        <p class="m-0 text-xs text-danger-ink" role="alert">{uploadError}</p>
    {/if}

    <!--
      Both the textarea and the preview stay mounted at all times (visibility
      toggled via `hidden`, not `{#if}`) so the field is always present in the
      form when it's submitted, regardless of which tab is active.
    -->
    <textarea
        {id}
        {name}
        bind:this={area}
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
