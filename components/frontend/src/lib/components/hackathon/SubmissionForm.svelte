<script lang="ts">
    import { enhance } from '$app/forms';
    import { beforeNavigate, goto } from '$app/navigation';
    import ConfirmDialog from '$lib/components/layout/ConfirmDialog.svelte';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
    import { isHttpsUrl } from '$lib/utils/url';

    // Structural, not the server's `SubmissionEntry`: that type lives behind
    // $lib/server and must never be imported into a component.
    type SavedEntry = {
        repositoryUrl?: string;
        attachmentFolderUrl?: string;
        description?: string;
        updatedAt?: Date;
        updatedBy?: string;
    };

    let {
        teamId,
        projectId,
        saved,
        message,
    }: {
        teamId: string;
        projectId: string;
        /** The team's entry as it stands, or null before its first save. */
        saved: SavedEntry | null;
        /** Why the last save of this team's form failed. */
        message?: string;
    } = $props();

    function formatDate(d: Date | undefined): string {
        if (!d) return '';
        return d.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    }

    /**
     * A link from the saved entry, to edit from — or nothing, when it is notes
     * from before the backend required https. Prefilling those would have the
     * form refuse its own starting value.
     */
    function prefillLink(value: string | undefined): string {
        return value && isHttpsUrl(value) ? value : '';
    }

    // What the fields start from, and what "unsaved" is measured against.
    const baseline = $derived({
        repositoryUrl: prefillLink(saved?.repositoryUrl),
        attachmentFolderUrl: prefillLink(saved?.attachmentFolderUrl),
        description: saved?.description ?? '',
    });

    // The fields as the team has them. Writable deriveds, as on the capabilities
    // panel: typing overrides them, and a successful save re-runs the load,
    // hands in a new `saved` and so resets them. A failed save hands in nothing
    // new, and what was typed stays for another try.
    let repositoryUrl = $derived(baseline.repositoryUrl);
    let attachmentFolderUrl = $derived(baseline.attachmentFolderUrl);
    let description = $derived(baseline.description);

    // Trimmed, as the action trims them, so a stray space is not a change.
    const repositoryChanged = $derived(repositoryUrl.trim() !== baseline.repositoryUrl.trim());
    const attachmentsChanged = $derived(
        attachmentFolderUrl.trim() !== baseline.attachmentFolderUrl.trim(),
    );
    const descriptionChanged = $derived(description.trim() !== baseline.description.trim());

    // "Repository link, Description": what Save would write.
    const summary = $derived(
        [
            repositoryChanged && 'Repository link',
            attachmentsChanged && 'Attachments folder link',
            descriptionChanged && 'Description',
        ]
            .filter((label) => label !== false)
            .join(', '),
    );
    const dirty = $derived(summary !== '');

    let pending = $state(false);
    let confirmDialog: ReturnType<typeof ConfirmDialog>;

    function discard() {
        repositoryUrl = baseline.repositoryUrl;
        attachmentFolderUrl = baseline.attachmentFolderUrl;
        description = baseline.description;
    }

    // Same guard as the capabilities panel and Manage Teams. A link inside the
    // app leaves without unloading the page, so `beforeunload` below never
    // hears of it; closing or reloading the tab gets the browser's own prompt
    // instead, which no page can replace.
    //
    // The guard cannot wait for an answer, so it always cancels, asks, and on a
    // "yes" goes where the participant was heading, with `leaving` set so it
    // does not ask twice.
    let leaving = false;

    beforeNavigate((navigation) => {
        if (leaving || !dirty || navigation.type === 'leave') return;
        const target = navigation.to?.url;
        navigation.cancel();
        if (!target) return;

        void confirmDialog
            .ask({
                title: 'Leave without saving?',
                message: `You have unsaved changes: ${summary}. They are lost if you leave.`,
                confirmLabel: 'Leave without saving',
                danger: true,
            })
            .then((leave) => {
                if (!leave) return;
                leaving = true;
                // Another site cannot be reached through the router.
                if (navigation.willUnload) window.location.href = target.href;
                // eslint-disable-next-line svelte/no-navigation-without-resolve -- the URL SvelteKit was already navigating to, resolved by whatever link started it
                else void goto(target);
            });
    });
</script>

<svelte:window
    onbeforeunload={(e) => {
        if (dirty && !leaving) e.preventDefault();
    }}
/>

<ConfirmDialog bind:this={confirmDialog} />

<form
    method="POST"
    action="?/saveSubmission"
    class="flex flex-col gap-3 border-t border-line pt-3"
    use:enhance={() => {
        pending = true;
        return async ({ result, update }) => {
            // A save that went through redirects to the read view. The fields
            // still differ from the entry this page was loaded with, so the
            // guard would take that for leaving with unsaved changes.
            if (result.type === 'redirect') leaving = true;
            // Not reset: a reset would put back the values the page was
            // loaded with, not what the team typed.
            await update({ reset: false });
            pending = false;
        };
    }}
>
    <input type="hidden" name="teamId" value={teamId} />
    <input type="hidden" name="projectId" value={projectId} />

    <!-- Quiet while everything is saved; warning-colored as soon as anything is
         not, the same color as the fields that changed — as on the capabilities
         panel. -->
    <div
        class="flex flex-wrap items-center gap-3 rounded-card border px-3 py-2 text-xs
               {dirty ? 'border-warning bg-warning/10' : 'border-line bg-raised'}"
        role="status"
    >
        <span class="flex-1 {dirty ? 'text-warning-ink' : 'text-ink-3'}">
            {#if pending}
                Saving…
            {:else if dirty}
                Unsaved changes: {summary}
            {:else if saved}
                No unsaved changes · last saved {formatDate(saved.updatedAt)}{#if saved.updatedBy}
                    by {saved.updatedBy}{/if}
            {:else}
                Not submitted yet
            {/if}
        </span>
        {#if message && !pending}
            <span class="text-danger-ink" role="alert">{message}</span>
        {/if}
        <button
            type="button"
            class="btn btn-sm btn-ghost"
            disabled={pending || !dirty}
            onclick={discard}
        >
            Discard
        </button>
        <!-- The one solid accent: saving is what this page is for. -->
        <button type="submit" class="btn btn-sm btn-solid" disabled={pending || !dirty}>
            Save
        </button>
    </div>

    <!-- None is required on its own; the action refuses only a save with all
         three empty. Each field is tinted while it differs from what is saved;
         the padding is there either way, so the tint does not move it. -->
    <div class="flex flex-col gap-1" class:opacity-60={pending}>
        <label
            class="field-label -mx-2 rounded-field px-2 py-1.5 {repositoryChanged ? 'bg-warning/10' : ''}"
            title={repositoryChanged ? 'Changed — not saved yet' : undefined}
        >
            Repository link
            <input
                type="url"
                name="repositoryUrl"
                maxlength={2048}
                bind:value={repositoryUrl}
                class="field h-8 px-2 text-xs"
            />
        </label>
        <label
            class="field-label -mx-2 rounded-field px-2 py-1.5 {attachmentsChanged ? 'bg-warning/10' : ''}"
            title={attachmentsChanged ? 'Changed — not saved yet' : undefined}
        >
            Attachments folder link
            <input
                type="url"
                name="attachmentFolderUrl"
                maxlength={2048}
                bind:value={attachmentFolderUrl}
                class="field h-8 px-2 text-xs"
            />
        </label>
        <div
            class="field-label -mx-2 rounded-field px-2 py-1.5 {descriptionChanged ? 'bg-warning/10' : ''}"
            title={descriptionChanged ? 'Changed — not saved yet' : undefined}
        >
            <label for="submission-description-{teamId}">Description</label>
            <MarkdownEditor
                id="submission-description-{teamId}"
                name="description"
                rows={6}
                maxlength={10000}
                bind:value={description}
            />
        </div>
    </div>
</form>
