<script lang="ts">
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
    import { resolve } from '$app/paths';

    let {
        page,
        cancelHref,
        submitLabel,
        message,
    }: {
        page: {
            title: string;
            content: string;
            visible: boolean;
        };
        /** Unresolved path — `resolve()` is called here, at the anchor. */
        cancelHref: string;
        submitLabel: string;
        /** Failure text from the action, if the last submit failed. */
        message?: string;
    } = $props();

    const FIELD_CLASS =
        'h-9 w-full rounded-none border border-surface-200-800 bg-surface-50-950 px-3 text-xs ' +
        'text-surface-950-50 placeholder:text-surface-700-300 focus:border-primary-500 ' +
        'focus:outline-none';
    const LABEL_CLASS = 'flex flex-col gap-1 text-xs font-semibold text-surface-500';
</script>

<!-- Server-side validation only: every rule here is one the action repeats, and
     the action is what the backend actually sees.

     The `?/save` action name is part of this component's contract — any page
     using it must expose an action by that name. -->
<form method="POST" action="?/save" class="flex w-full flex-col gap-6">
    {#if message}
        <p class="m-0 text-xs text-error-500" role="alert">{message}</p>
    {/if}

    <label class={LABEL_CLASS}>
        Title
        <input
            type="text"
            name="title"
            required
            minlength="3"
            maxlength="255"
            value={page.title}
            placeholder="Getting started"
            class={FIELD_CLASS}
        />
    </label>

    <label class="flex items-center gap-2 text-xs text-surface-950-50">
        <input type="checkbox" name="visible" checked={page.visible} class="checkbox" />
        Visible to participants
    </label>

    <div class="{LABEL_CLASS} w-full">
        <label for="page-content">Content</label>
        <MarkdownEditor
            id="page-content"
            name="content"
            value={page.content}
            rows={16}
            maxlength={10000}
            placeholder="What should participants know?"
        />
    </div>

    <div class="flex gap-2">
        <button type="submit" class="btn btn-sm preset-filled-primary-500">{submitLabel}</button>
        <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic path from page data; resolve() is route-literal typed -->
        <a href={resolve(cancelHref as any)} class="btn btn-sm preset-tonal-surface no-underline">
            Cancel
        </a>
    </div>
</form>
