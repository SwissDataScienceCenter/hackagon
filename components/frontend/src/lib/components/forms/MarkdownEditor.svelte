<script lang="ts">
    import { tick } from 'svelte';
    import MarkdownContent from './MarkdownContent.svelte';
    import ImagePickerDialog from './ImagePickerDialog.svelte';
    import {
        BULLET_LIST,
        HEADING,
        NUMBERED_LIST,
        QUOTE,
        insertBlock,
        insertLink,
        toggleCodeBlock,
        toggleInline,
        toggleLinePrefix,
        type EditState,
    } from '$lib/utils/markdownEdit';
    import {
        DELIMITERS,
        DELIMITER_LABELS,
        tableFromPaste,
        type Delimiter,
    } from '$lib/utils/markdownTable';
    import Bold from 'lucide-svelte/icons/bold';
    import Italic from 'lucide-svelte/icons/italic';
    import Heading1 from 'lucide-svelte/icons/heading-1';
    import Heading2 from 'lucide-svelte/icons/heading-2';
    import Heading3 from 'lucide-svelte/icons/heading-3';
    import LinkIcon from 'lucide-svelte/icons/link';
    import List from 'lucide-svelte/icons/list';
    import ListOrdered from 'lucide-svelte/icons/list-ordered';
    import QuoteIcon from 'lucide-svelte/icons/quote';
    import Code from 'lucide-svelte/icons/code';
    import CodeXml from 'lucide-svelte/icons/code-xml';
    import TableIcon from 'lucide-svelte/icons/table';

    let {
        id,
        name,
        value = '',
        rows = 8,
        placeholder = '',
        required = false,
        maxlength,
        uploadEndpoint,
        browseEndpoint = undefined,
    }: {
        /** Target for an external `<label for=…>`. Without it a surrounding label
         *  would bind to the first labelable control in here — the Write tab, or
         *  now any formatting button — instead of the textarea. Every call site
         *  passes it; adding a control above the textarea does not change that
         *  contract, it only raises the cost of breaking it. */
        id?: string;
        name: string;
        value?: string;
        rows?: number;
        placeholder?: string;
        required?: boolean;
        maxlength?: number;
        /** POST target that presigns an upload and returns {uploadUrl, publicUrl}.
         *  Omit it and no upload control renders: a button that cannot work is
         *  worse than no button. Every surface that mounts this editor now has
         *  one — platform pages were the last holdout, and they got their own
         *  kind (`site/media/…`, global-Admin only) rather than borrowing a
         *  hackathon's. */
        uploadEndpoint?: string;
        /** Listing endpoint for the picker's "already uploaded" half. Omit it
         *  and the picker offers upload only — correct wherever no listing scope
         *  covers the prefix (see ObjectScope in the storage proto: nobody may
         *  list `users/<id>/avatar/`, because that prefix is other people's
         *  faces). */
        browseEndpoint?: string;
    } = $props();

    let text = $state(value);
    let mode: 'write' | 'preview' = $state('write');

    let area: HTMLTextAreaElement;
    // Whether the image picker is showing. Its own dialog reports upload
    // failures, so this file keeps no upload state of its own any more.
    let picking = $state(false);

    // Unique per instance: /manage/pages mounts one editor per page plus the
    // create form, so a hard-coded id would give several controls the same
    // label target.
    const uid = $props.id();

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

    // Images arrive through ImagePickerDialog, which owns the WebP re-encoding,
    // the presign, the direct PUT, the alt text and the error line — this file
    // no longer imports `$lib/upload` at all. The insert goes through
    // `insertAtCaret`, never `insertBlock`: an image is inline.

    // ── the formatting toolbar ──────────────────────────────────────────────
    //
    // Not a rich-text editor and deliberately not one: each button rewrites the
    // same markdown a person could have typed, so the textarea stays the single
    // source of truth and hand-editing can never disagree with the buttons.
    // The transformations themselves are pure functions in
    // `$lib/utils/markdownEdit` — that is where the awkward cases (empty caret
    // vs selection, italic pressed on bold, a multi-line list toggle) are
    // pinned down by tests.

    interface Tool {
        /** Accessible name. Distinct enough to select on, exactly. */
        label: string;
        /** Tooltip; names the shortcut where there is one. */
        hint: string;
        icon: typeof Bold;
        run: (state: EditState) => EditState;
    }

    const TOOLS: Tool[] = [
        { label: 'Bold', hint: 'Bold (Ctrl+B)', icon: Bold, run: (s) => toggleInline(s, '**') },
        { label: 'Italic', hint: 'Italic (Ctrl+I)', icon: Italic, run: (s) => toggleInline(s, '*') },
        {
            label: 'Heading 1',
            hint: 'Heading 1',
            icon: Heading1,
            run: (s) => toggleLinePrefix(s, HEADING(1)),
        },
        {
            label: 'Heading 2',
            hint: 'Heading 2',
            icon: Heading2,
            run: (s) => toggleLinePrefix(s, HEADING(2)),
        },
        {
            label: 'Heading 3',
            hint: 'Heading 3',
            icon: Heading3,
            run: (s) => toggleLinePrefix(s, HEADING(3)),
        },
        { label: 'Link', hint: 'Link (Ctrl+K)', icon: LinkIcon, run: insertLink },
        {
            label: 'Bulleted list',
            hint: 'Bulleted list',
            icon: List,
            run: (s) => toggleLinePrefix(s, BULLET_LIST),
        },
        {
            label: 'Numbered list',
            hint: 'Numbered list',
            icon: ListOrdered,
            run: (s) => toggleLinePrefix(s, NUMBERED_LIST),
        },
        { label: 'Quote', hint: 'Quote', icon: QuoteIcon, run: (s) => toggleLinePrefix(s, QUOTE) },
        {
            label: 'Inline code',
            hint: 'Inline code',
            icon: Code,
            run: (s) => toggleInline(s, '`'),
        },
        { label: 'Code block', hint: 'Code block', icon: CodeXml, run: toggleCodeBlock },
    ];

    /** Read the textarea's live selection. Survives the button click: the
     *  selection stays on a blurred textarea, and the buttons suppress the
     *  focus change anyway (see the mousedown handler). */
    function current(): EditState {
        return {
            text,
            start: area?.selectionStart ?? text.length,
            end: area?.selectionEnd ?? text.length,
        };
    }

    /** Write a transformation back and restore the selection it asks for.
     *  `tick()` rather than a microtask because the selection has to be set
     *  AFTER Svelte has written the new value into the element — setting it on
     *  the old value would be discarded by the value update. */
    async function apply(next: EditState) {
        text = next.text;
        await tick();
        area?.focus();
        area?.setSelectionRange(next.start, next.end);
    }

    /**
     * Keyboard shortcuts, active only while the textarea has focus.
     *
     * These three are what anyone who has used a markdown editor reaches for,
     * and every editor overrides them the same way. Scoped to the textarea and
     * only with a plain Ctrl/Cmd — no Alt, no Shift — so nothing outside the
     * field changes meaning.
     */
    const SHORTCUTS: Record<string, (state: EditState) => EditState> = {
        b: (s) => toggleInline(s, '**'),
        i: (s) => toggleInline(s, '*'),
        k: insertLink,
    };

    function onAreaKeydown(event: KeyboardEvent) {
        if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
        const run = SHORTCUTS[event.key.toLowerCase()];
        if (!run) return;
        event.preventDefault();
        void apply(run(current()));
    }

    // Roving tabindex: a toolbar is ONE tab stop, arrows move within it.
    // Twelve buttons between the label and the field would otherwise be twelve
    // stops on the way to typing.
    let buttons: HTMLButtonElement[] = $state([]);
    let focusedTool = $state(0);

    function onToolbarKeydown(event: KeyboardEvent) {
        const last = buttons.length - 1;
        let next: number;
        if (event.key === 'ArrowRight') next = focusedTool >= last ? 0 : focusedTool + 1;
        else if (event.key === 'ArrowLeft') next = focusedTool <= 0 ? last : focusedTool - 1;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = last;
        else return;
        event.preventDefault();
        focusedTool = next;
        buttons[next]?.focus();
    }

    // ── paste a table ───────────────────────────────────────────────────────

    let tableOpen = $state(false);
    let pasted = $state('');
    let pasteArea: HTMLTextAreaElement | undefined = $state();
    /** `auto` defers to the sniffer; anything else is the person overruling it. */
    let chosenDelimiter: 'auto' | Delimiter = $state('auto');
    let firstRowIsHeader = $state(true);

    const table = $derived(
        tableFromPaste(pasted, {
            firstRowIsHeader,
            delimiter: chosenDelimiter === 'auto' ? undefined : chosenDelimiter,
        }),
    );

    /** A programmatic insert bypasses `maxlength` — the browser only enforces it
     *  against typing — so the field would submit a value the server rejects.
     *  Say so before the button is pressed instead of after the save fails. */
    const tableTooLong = $derived(
        maxlength !== undefined &&
            table !== null &&
            text.length + table.markdown.length + 2 > maxlength,
    );

    async function openTable() {
        tableOpen = true;
        await tick();
        pasteArea?.focus();
    }

    function closeTable(returnFocus: boolean) {
        tableOpen = false;
        // Back to the disclosure that opened it, not to the top of the page.
        if (returnFocus) buttons[TOOLS.length]?.focus();
    }

    async function insertTable() {
        if (!table || tableTooLong) return;
        await apply(insertBlock(current(), table.markdown));
        // Focus is in the textarea now, so do not steal it back.
        closeTable(false);
        pasted = '';
    }
</script>

<!-- Escape closes the paste panel. On the window rather than on the panel: a
     `role="group"` div carrying a key handler trips the a11y lint
     (non-interactive role with an interaction), and only the instance whose
     panel is open reacts to this anyway. -->
<svelte:window
    onkeydown={(event) => {
        if (tableOpen && event.key === 'Escape') closeTable(true);
    }}
/>

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
            onclick={() => {
                mode = 'preview';
                closeTable(false);
            }}
            aria-pressed={mode === 'preview'}
            class="chip {mode === 'preview' ? 'chip-active' : ''}"
        >
            Preview
        </button>

        {#if uploadEndpoint}
            <!-- Pushed to the right so it reads as a tool for the pane rather
                 than a third tab. It opens the shared picker instead of a bare
                 file input: this control used to be a <label> wrapping a hidden
                 input, which meant the ONLY way to add a picture was to find the
                 file again — so the same photograph got uploaded once per page
                 that showed it, and dragging one in did nothing. -->
            <button
                type="button"
                class="btn btn-sm btn-quiet ml-auto"
                onclick={() => (picking = true)}
            >
                Insert image
            </button>
        {/if}
    </div>

    {#if uploadEndpoint}
        <!-- Outside the tabs row and NOT wrapped in `{#if picking}`: a native
             <dialog> returns focus to whatever opened it when it closes, and
             unmounting it takes that away.

             `title` shares no words with any field label on the page, on
             purpose. A closed <dialog> is still in the document and its heading
             is its accessible name, so naming this after the field it sits under
             makes `getByLabel(<that field>)` match two elements. -->
        <ImagePickerDialog
            bind:open={picking}
            {uploadEndpoint}
            {browseEndpoint}
            title="Insert an image"
            fileLabel="Choose an image file to insert"
            multiple
            onpick={({ url, alt }) => insertAtCaret(`![${alt}](${url})`)}
        />
    {/if}

    {#if mode === 'write'}
        <!-- Only over the Write pane: a formatting button with no caret to act
             on is a control that cannot work. `aria-controls` names the field it
             edits, which is the only thing tying the two together for a screen
             reader once the toolbar is its own tab stop.

             `tabindex={-1}` on the container: it is deliberately NOT in the tab
             sequence — the buttons are, one at a time (roving tabindex) — but
             the role wants it programmatically focusable. -->
        <div
            role="toolbar"
            aria-label="Formatting"
            aria-controls={id}
            aria-orientation="horizontal"
            onkeydown={onToolbarKeydown}
            tabindex={-1}
            class="flex flex-wrap items-center gap-0.5 border-b border-line pb-1"
        >
            {#each TOOLS as tool, i (tool.label)}
                {@const Icon = tool.icon}
                <button
                    type="button"
                    bind:this={buttons[i]}
                    class="btn btn-icon btn-quiet"
                    aria-label={tool.label}
                    title={tool.hint}
                    tabindex={focusedTool === i ? 0 : -1}
                    onfocus={() => (focusedTool = i)}
                    onmousedown={(event) => event.preventDefault()}
                    onclick={() => {
                        focusedTool = i;
                        void apply(tool.run(current()));
                    }}
                >
                    <Icon size={16} aria-hidden="true" />
                </button>
            {/each}

            <!-- Last, and the only one that opens something instead of editing
                 text — so it sits behind a separator.

                 Named for what it opens, not for what the panel's own button
                 does: two controls both called "Insert table", one of them the
                 disclosure for the other, is ambiguous to a screen reader and
                 to anyone reading the tooltip. -->
            <span class="mx-1 h-4 w-px bg-line" aria-hidden="true"></span>
            <button
                type="button"
                bind:this={buttons[TOOLS.length]}
                class="btn btn-icon btn-quiet {tableOpen ? 'chip-active' : ''}"
                aria-label="Paste a table"
                aria-expanded={tableOpen}
                title="Paste a table (from a spreadsheet or CSV)"
                tabindex={focusedTool === TOOLS.length ? 0 : -1}
                onfocus={() => (focusedTool = TOOLS.length)}
                onclick={() => {
                    focusedTool = TOOLS.length;
                    if (tableOpen) closeTable(true);
                    else void openTable();
                }}
            >
                <TableIcon size={16} aria-hidden="true" />
            </button>
        </div>
    {/if}

    {#if tableOpen}
        <!-- Inline rather than a modal: the pasted source and the markdown it
             will produce are both worth seeing next to the document. -->
        <div
            role="group"
            aria-label="Paste a table"
            class="flex flex-col gap-2 rounded-card border border-line bg-raised p-3"
        >
            <label class="flex flex-col gap-1 text-xs" for="{uid}-paste">
                Paste rows from a spreadsheet, or CSV text
                <textarea
                    id="{uid}-paste"
                    bind:this={pasteArea}
                    bind:value={pasted}
                    rows={4}
                    placeholder={'Name\tRole\nAlice\tOrganizer'}
                    class="field field-area font-mono"
                ></textarea>
            </label>

            <div class="flex flex-wrap items-end gap-3">
                <label class="flex flex-col gap-1 text-xs" for="{uid}-delimiter">
                    Separator
                    <select
                        id="{uid}-delimiter"
                        bind:value={chosenDelimiter}
                        class="field w-40"
                    >
                        <option value="auto">Detect automatically</option>
                        {#each DELIMITERS as delimiter (delimiter)}
                            <option value={delimiter}>{DELIMITER_LABELS[delimiter]}</option>
                        {/each}
                    </select>
                </label>

                <label class="flex items-center gap-2 text-xs">
                    <input type="checkbox" bind:checked={firstRowIsHeader} />
                    First row is a header
                </label>
            </div>

            <!-- The shape, read back. "It inserted something" and "it found the
                 columns" are different claims, and only the second one is what
                 you are about to commit to the document. -->
            <p class="m-0 text-xs text-ink-3" aria-live="polite">
                {#if !pasted.trim()}
                    Nothing pasted yet.
                {:else if !table}
                    Nothing in there to convert.
                {:else}
                    {table.columns}
                    {table.columns === 1 ? 'column' : 'columns'} × {table.rows}
                    {table.rows === 1 ? 'row' : 'rows'}, separated by {DELIMITER_LABELS[
                        table.delimiter
                    ].toLowerCase()}.
                    {#if table.ambiguous}
                        More than one separator fits — pick one if this looks wrong.
                    {/if}
                {/if}
            </p>

            {#if tableTooLong}
                <p class="m-0 text-xs text-danger-ink" role="alert">
                    That table would push this field past its {maxlength}-character limit.
                </p>
            {/if}

            <div class="flex gap-2">
                <button
                    type="button"
                    class="btn btn-sm btn-accent"
                    disabled={!table || tableTooLong}
                    onclick={insertTable}
                >
                    Insert table
                </button>
                <button
                    type="button"
                    class="btn btn-sm btn-quiet"
                    onclick={() => closeTable(true)}
                >
                    Cancel
                </button>
            </div>
        </div>
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
        onkeydown={onAreaKeydown}
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
