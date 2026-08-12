<script lang="ts">
    import ImagePickerDialog from './ImagePickerDialog.svelte';

    let {
        name,
        value = $bindable(''),
        endpoint,
        browseEndpoint = undefined,
        label,
        id = undefined,
        buttonLabel = 'Choose image',
        fileLabel = 'Choose a file to upload',
        dialogTitle = undefined,
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
        /** Listing endpoint for the "already uploaded" half of the picker.
         *  Omit it and the picker offers upload only — which is right for an
         *  avatar: no listing scope covers `users/<id>/avatar/`, because that
         *  prefix is other people's faces. */
        browseEndpoint?: string;
        /** Visible caption. Its `for` points at the text field, so
         *  `getByLabel(label)` resolves to the thing a person types into. */
        label: string;
        /** Id for the text field; derived from `name` when not given. */
        id?: string;
        buttonLabel?: string;
        /** Accessible name of the file input INSIDE the picker dialog. MUST
         *  share no words with `label` — a page-wide `getByLabel(label)` would
         *  otherwise match both and the field would stop being addressable. */
        fileLabel?: string;
        /** Heading of the picker dialog. Defaults to `buttonLabel`.
         *
         *  SAME CONSTRAINT AS `fileLabel`, and it is not theoretical: the
         *  dialog's heading IS its accessible name, a closed `<dialog>` is
         *  `display:none` but still in the document, and Playwright's
         *  `getByLabel` matches hidden elements by substring. Passing
         *  "Profile picture" here — identical to the field's own caption —
         *  made `getByLabel("Profile picture")` resolve to two elements and
         *  every avatar test fail on a strict-mode violation. Name the dialog
         *  after the JOB ("Event logo"), never after the field. */
        dialogTitle?: string;
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

    // Whether the picker is showing. It is deliberately NOT `{#if picking}`
    // around the dialog: a native modal returns focus to the element that
    // opened it when it closes, and unmounting it takes that away.
    let picking = $state(false);
    let picked = $state(false);
</script>

<div class="flex flex-col gap-2">
    {#if !compact}
        <label for={fieldId} class="field-label">{label}</label>
    {/if}

    <div class="flex flex-wrap items-center gap-3">
        <!-- One control, two ways in. This used to be a `<label>` wrapping a
             hidden file input — the only way to add a picture, so the same
             photograph got uploaded once per page that showed it, and there was
             no way to drag a file at all. The button now opens a picker that
             offers upload (with drag and drop) and, where a listing scope
             exists, whatever is already stored. -->
        <button
            type="button"
            class="btn btn-sm"
            {disabled}
            onclick={() => (picking = true)}
        >
            {buttonLabel}
        </button>

        {#if value}
            <!-- Removal has to be its own control: clearing a text field only
                 works while there IS a text field, and `allowUrl` may be off. -->
            <button
                type="button"
                class="btn btn-sm btn-quiet"
                {disabled}
                onclick={() => {
                    value = '';
                    picked = false;
                }}
            >
                Remove
            </button>
        {/if}

        {#if picked}
            <span class="text-xs text-success-ink">Chosen — save to keep it.</span>
        {/if}
    </div>

    <ImagePickerDialog
        bind:open={picking}
        uploadEndpoint={endpoint}
        {browseEndpoint}
        title={dialogTitle ?? buttonLabel}
        {fileLabel}
        {maxMb}
        onpick={({ url }) => {
            value = url;
            picked = true;
        }}
    />

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
