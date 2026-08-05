<script lang="ts">
    import { resolve } from '$app/paths';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';

    let {
        track,
        cancelHref,
        submitLabel,
        message
    }: {
        track: {
            name: string;
            description: string;
        };
        /** Unresolved path — `resolve()` is called here, at the anchor. */
        cancelHref: string;
        submitLabel: string;
        /** Failure text from the action, if the last submit failed. */
        message?: string;
    } = $props();
</script>

<!-- Server-side validation only: every rule here is one the action repeats, and
     the action is what the backend actually sees.

     The `?/save` action name is part of this component's contract — any page
     using it must expose an action by that name. -->
<form method="POST" action="?/save" class="flex w-full flex-col gap-6">
    {#if message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{message}</p>
    {/if}

    <label class="field-label">
        Name
        <input
            type="text"
            name="name"
            required
            minlength="3"
            maxlength="255"
            value={track.name}
            placeholder="Climate Tech"
            class="field"
        />
    </label>

    <!-- Last and full width: the only field with no natural size, and the one
         where the room is worth having for the source and its preview both. -->
    <div class="field-label w-full">
        <label for="track-description">Description</label>
        <MarkdownEditor
            id="track-description"
            name="description"
            value={track.description}
            rows={10}
            required
            placeholder="What kind of projects belong in this track?"
        />
    </div>

    <div class="flex gap-2">
        <button type="submit" class="btn btn-sm btn-solid">{submitLabel}</button>
        <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic path from page data; resolve() is route-literal typed -->
        <a href={resolve(cancelHref as any)} class="btn btn-sm btn-ghost no-underline">
            Cancel
        </a>
    </div>
</form>
