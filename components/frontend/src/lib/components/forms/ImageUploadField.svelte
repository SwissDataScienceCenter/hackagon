<script lang="ts">
    import { IMAGE_ACCEPT, UploadError, uploadImage } from '$lib/upload';

    let {
        name,
        value = $bindable(''),
        endpoint,
        label,
        id = undefined,
        buttonLabel = 'Upload image',
        fileLabel = 'Choose a file to upload',
        maxMb,
        allowUrl = true,
        hint = '',
        previewClass = 'h-20 w-auto rounded-control border border-line object-contain',
        previewAlt = 'Current image',
        disabled = false,
        compact = false,
    }: {
        /** Form field name the stored path is submitted under. */
        name: string;
        /** The stored path or URL. Bindable so a parent list can own the row. */
        value?: string;
        /** Presign endpoint. Decides the upload kind and owner server-side. */
        endpoint: string;
        /** Visible caption. Its `for` points at the text field, so
         *  `getByLabel(label)` resolves to the thing a person types into. */
        label: string;
        /** Id for the text field; derived from `name` when not given. */
        id?: string;
        buttonLabel?: string;
        /** Accessible name of the file input. MUST share no words with `label`
         *  — a page-wide `getByLabel(label)` would otherwise match both. */
        fileLabel?: string;
        /** Shown in the hint line. The presign is the real limit. */
        maxMb?: number;
        /** Also offer a text field for pasting a link. Off leaves a hidden
         *  input, which still round-trips whatever is already stored. */
        allowUrl?: boolean;
        hint?: string;
        previewClass?: string;
        previewAlt?: string;
        disabled?: boolean;
        /** Drop the caption and the hint line — for a table row, where the
         *  column heading already says what the picture is. */
        compact?: boolean;
    } = $props();

    const fieldId = $derived(id ?? `upload-${name}`);

    let uploading = $state(false);
    let uploaded = $state(false);
    let uploadError = $state('');

    async function pick(event: Event & { currentTarget: HTMLInputElement }) {
        const file = event.currentTarget.files?.[0];
        if (!file) return;

        uploading = true;
        uploaded = false;
        uploadError = '';
        try {
            // One call: re-encode, ask permission, PUT to the store. What comes
            // back is the stable path — never the presigned URL, which expires
            // and is a bearer credential.
            const { publicUrl } = await uploadImage(endpoint, file);
            value = publicUrl;
            uploaded = true;
        } catch (e) {
            uploadError =
                e instanceof UploadError
                    ? e.message
                    : 'Upload failed — check your connection and try again';
        } finally {
            uploading = false;
            // Clear it, or picking the SAME file twice fires no change event.
            event.currentTarget.value = '';
        }
    }
</script>

<div class="flex flex-col gap-2">
    {#if !compact}
        <label for={fieldId} class="field-label">{label}</label>
    {/if}

    <div class="flex flex-wrap items-center gap-3">
        <!-- A <label> wrapping a hidden input, because a styled button cannot
             open a file picker on its own. This is the OBVIOUS path: the bare
             `<input type=file>` this replaces looked like page furniture next to
             a full-width text field, which is how an event logo could only be
             changed by pasting a URL even though the uploader was right there.

             The accessible name is deliberately generic and shares no words
             with `label`: a page-wide getByLabel("Profile picture") must not
             also match this control. -->
        <label
            class="btn btn-sm cursor-pointer"
            class:opacity-60={uploading || disabled}
        >
            {uploading ? 'Uploading…' : buttonLabel}
            <input
                type="file"
                accept={IMAGE_ACCEPT}
                aria-label={fileLabel}
                class="hidden"
                disabled={uploading || disabled}
                onchange={pick}
            />
        </label>

        {#if value}
            <!-- Removal has to be its own control: clearing a text field only
                 works while there IS a text field, and `allowUrl` may be off. -->
            <button
                type="button"
                class="btn btn-sm btn-quiet"
                {disabled}
                onclick={() => {
                    value = '';
                    uploaded = false;
                    uploadError = '';
                }}
            >
                Remove
            </button>
        {/if}

        {#if uploadError}
            <span class="text-xs text-danger-ink" role="alert">{uploadError}</span>
        {:else if uploaded}
            <span class="text-xs text-success-ink">Uploaded — save to keep it.</span>
        {/if}
    </div>

    {#if allowUrl}
        <!-- `type="text"`, NOT `type="url"`. An uploaded image is stored as a
             root-relative path (/objects/<bucket>/<key>) so it resolves from
             localhost, the tunnel and a deployment alike — and `type="url"`
             rejects exactly that, which made an already-uploaded picture
             impossible to re-save through its own form. External links still
             work: pasting one stays legitimate for imagery hosted elsewhere. -->
        <input
            id={fieldId}
            type="text"
            {name}
            {disabled}
            placeholder="/objects/… or https://…"
            bind:value
            class="field"
        />
    {:else}
        <!-- No text field, but the value must still be submitted: forms that
             replace a whole record (the prize table) would otherwise strip the
             picture of every row they hand back. -->
        <input type="hidden" {name} value={value ?? ''} />
    {/if}

    {#if !compact}
        <p class="m-0 text-meta text-ink-3">
            {hint || 'PNG, JPEG, WebP or GIF.'}{maxMb ? ` Up to ${maxMb} MB.` : ''}
            The file goes straight to storage; nothing is stored on this event or
            profile until you save.
        </p>
    {/if}

    {#if value}
        <img src={value} alt={previewAlt} class={previewClass} />
    {/if}
</div>
