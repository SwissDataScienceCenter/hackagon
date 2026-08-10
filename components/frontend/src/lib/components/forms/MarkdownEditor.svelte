<script lang="ts">
    import { tick } from 'svelte';
    import Bold from 'lucide-svelte/icons/bold';
    import Code from 'lucide-svelte/icons/code';
    import Heading from 'lucide-svelte/icons/heading';
    import Italic from 'lucide-svelte/icons/italic';
    import Link2 from 'lucide-svelte/icons/link-2';
    import List from 'lucide-svelte/icons/list';
    import ListOrdered from 'lucide-svelte/icons/list-ordered';
    import Quote from 'lucide-svelte/icons/quote';

    import MarkdownContent from './MarkdownContent.svelte';
    import {
        continueList,
        cycleHeading,
        diffRange,
        insertLink,
        toggleBold,
        toggleBulletList,
        toggleCode,
        toggleItalic,
        toggleOrderedList,
        toggleQuote,
        type Edit,
    } from '$lib/utils/markdownEdit';

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
         *  would bind to the first button in the toolbar — buttons are labelable
         *  too — instead of the textarea. */
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
    let area: HTMLTextAreaElement | undefined = $state();

    /* Grouped so the rule between groups falls where the meaning changes:
       character styling, then things that point somewhere, then block shape. */
    const GROUPS = [
        [
            { label: 'Bold', shortcut: 'B', icon: Bold, run: toggleBold },
            { label: 'Italic', shortcut: 'I', icon: Italic, run: toggleItalic },
            { label: 'Code', icon: Code, run: toggleCode },
        ],
        [
            { label: 'Heading', icon: Heading, run: cycleHeading },
            { label: 'Link', shortcut: 'K', icon: Link2, run: insertLink },
        ],
        [
            { label: 'Bulleted list', icon: List, run: toggleBulletList },
            { label: 'Numbered list', icon: ListOrdered, run: toggleOrderedList },
            { label: 'Quote', icon: Quote, run: toggleQuote },
        ],
    ];

    const SHORTCUTS = new Map(
        GROUPS.flat()
            .filter((tool) => tool.shortcut)
            .map((tool) => [tool.shortcut!.toLowerCase(), tool.run]),
    );

    /* Resolved after mount rather than during render, so the server does not
       have to guess which keyboard the reader has. */
    let modKey = $state('Ctrl+');
    $effect(() => {
        if (/Mac|iPhone|iPad/.test(navigator.userAgent)) modKey = '⌘';
    });

    const hint = (tool: { label: string; shortcut?: string }) =>
        tool.shortcut ? `${tool.label} (${modKey}${tool.shortcut})` : tool.label;

    /**
     * The single write path back into the textarea.
     *
     * It goes through `insertText` where the browser has it so that ⌘Z still
     * undoes a toolbar click — assigning to `value` wholesale would wipe the
     * browser's undo stack, and losing an hour of typing to a mis-clicked
     * button is a worse failure than any of these buttons is a win. `diffRange`
     * narrows the edit first, because `insertText` only preserves undo when it
     * is handed the few characters that actually changed.
     */
    async function apply(transform: (edit: Edit) => Edit | null) {
        if (!area) return;

        const next = transform({ value: text, start: area.selectionStart, end: area.selectionEnd });
        if (!next) return;

        const { from, to, text: inserted } = diffRange(text, next.value);
        // No transform currently returns its input unchanged, but if one ever
        // does, `execCommand('delete')` on a collapsed selection below would eat
        // the character before the caret instead of doing nothing.
        if (from === to && !inserted) return;

        area.focus();
        area.setSelectionRange(from, to);

        const undoable =
            typeof document.execCommand === 'function' &&
            (inserted
                ? document.execCommand('insertText', false, inserted)
                : document.execCommand('delete'));

        if (!undoable) text = next.value;

        await tick();
        area.setSelectionRange(next.start, next.end);
    }

    function onkeydown(event: KeyboardEvent) {
        const mod = event.metaKey || event.ctrlKey;

        if (event.key === 'Enter' && !mod && !event.shiftKey && !event.altKey) {
            // Ask first, act second: whether Enter is ours depends on where the
            // caret is, and `preventDefault` has to be decided synchronously.
            if (!area) return;
            const handled = continueList({
                value: text,
                start: area.selectionStart,
                end: area.selectionEnd,
            });
            if (!handled) return;

            event.preventDefault();
            void apply(continueList);
            return;
        }

        if (!mod || event.altKey) return;
        const run = SHORTCUTS.get(event.key.toLowerCase());
        if (!run) return;

        event.preventDefault();
        void apply(run);
    }

    const remaining = $derived(maxlength ? maxlength - text.length : 0);
</script>

<div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <!-- The toolbar is the whole point of the component for someone who has
             not written markdown: it teaches the syntax by writing it, rather
             than describing it in a caption nobody reads. Disabled under the
             preview, where there is no caret for it to act on. -->
        <div class="flex flex-wrap items-center gap-0.5" role="group" aria-label="Formatting">
            {#each GROUPS as group, groupIndex (groupIndex)}
                {#if groupIndex > 0}
                    <span class="mx-1.5 h-4 w-px shrink-0 bg-line" aria-hidden="true"></span>
                {/if}
                {#each group as tool (tool.label)}
                    {@const Icon = tool.icon}
                    <button
                        type="button"
                        class="btn btn-sm btn-icon btn-quiet"
                        title={hint(tool)}
                        aria-label={hint(tool)}
                        disabled={mode === 'preview'}
                        onclick={() => apply(tool.run)}
                    >
                        <Icon size={15} aria-hidden="true" />
                    </button>
                {/each}
            {/each}
        </div>

        <!-- Chips, not buttons: this picks which pane is showing, and a solid
             accent would both read as an action and compete with the form's
             real submit. -->
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
    </div>

    <!--
      Both the textarea and the preview stay mounted at all times (visibility
      toggled via `hidden`, not `{#if}`) so the field is always present in the
      form when it's submitted, regardless of which tab is active.

      `oninvalid` covers the corner that `hidden` opens up: a browser will not
      focus a `display: none` control to show its validation bubble, so a
      required field left empty under the preview blocks submission with nothing
      on screen to explain it. Switching back puts the empty box in front of the
      person who has to fill it in.
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
        {onkeydown}
        oninvalid={() => (mode = 'write')}
        class="field field-area {mode === 'write' ? '' : 'hidden'}"
    ></textarea>

    <!-- The same box as the textarea it replaces, by construction rather than by
         coincidence: switching panes must not move the frame, so the preview
         takes `field field-area` too instead of re-spelling its padding, and
         its floor is the textarea's own line box (`0.8125rem × 1.6`) rather
         than a round number that only looks close. -->
    <div
        class="field field-area {mode === 'preview' ? '' : 'hidden'}"
        style="min-height: {rows * 1.3}rem"
    >
        {#if text.trim()}
            <MarkdownContent content={text} />
        {:else}
            <p class="m-0 text-ink-3">Nothing to preview yet.</p>
        {/if}
    </div>

    <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <!-- Closed by default and one line tall: the toolbar covers what most
             people need, and this is for the things it has no button for. -->
        <details class="min-w-0 text-xs">
            <summary class="cursor-pointer text-ink-3 select-none hover:text-ink-2">
                Formatting help
            </summary>
            <dl
                class="mt-2 grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 text-ink-3"
            >
                <dt><code>**bold**</code></dt>
                <dd class="m-0"><strong class="text-ink">bold</strong></dd>

                <dt><code>_italic_</code></dt>
                <dd class="m-0"><em>italic</em></dd>

                <dt><code>## Heading</code></dt>
                <dd class="m-0">a section heading</dd>

                <dt><code>- item</code></dt>
                <dd class="m-0">a bulleted list — Enter continues it, Enter twice ends it</dd>

                <dt><code>1. item</code></dt>
                <dd class="m-0">a numbered list, renumbered as you go</dd>

                <dt><code>- [ ] task</code></dt>
                <dd class="m-0">a checklist</dd>

                <dt><code>[text](https://…)</code></dt>
                <dd class="m-0">a link</dd>

                <dt><code>![alt](https://…)</code></dt>
                <dd class="m-0">an image</dd>

                <dt><code>&gt; quote</code></dt>
                <dd class="m-0">an indented quotation</dd>

                <dt><code>| a | b |</code></dt>
                <dd class="m-0">a table row — put <code>| --- | --- |</code> under the first</dd>

                <dt><code>---</code></dt>
                <dd class="m-0">a horizontal divider</dd>

                <dt>Enter</dt>
                <dd class="m-0">a new line; leave a blank line to start a paragraph</dd>
            </dl>
        </details>

        {#if maxlength}
            <!-- Only once it is close enough to matter: a counter sitting at
                 9,624 remaining is noise on every form that uses this. -->
            <span
                class="tnum shrink-0 text-xs {remaining < 0
                    ? 'text-danger-ink'
                    : 'text-warning-ink'} {remaining > maxlength * 0.1 ? 'invisible' : ''}"
                aria-live="polite"
            >
                {remaining.toLocaleString('de-CH')} characters left
            </span>
        {/if}
    </div>
</div>
