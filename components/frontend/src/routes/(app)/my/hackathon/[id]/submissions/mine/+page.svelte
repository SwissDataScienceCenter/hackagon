<script lang="ts">
    import { enhance } from '$app/forms';
    import type { ActionData, PageData } from './$types';
    import { isHttpsUrl } from '$lib/utils/url';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
    import SubmissionContent from '$lib/components/hackathon/SubmissionContent.svelte';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Derived from the load's return shape rather than restated, so the two
    // can't drift.
    type Entry = PageData['groups'][number]['entry'];

    let pending: boolean = $state(false);

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
</script>

{#snippet lastSaved(entry: Entry)}
    <span class="text-xs text-ink-3">
        {#if entry}
            Last saved {formatDate(entry.updatedAt)}{#if entry.updatedBy}
                by {entry.updatedBy}{/if}
        {:else}
            Not submitted yet
        {/if}
    </span>
{/snippet}

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/projects). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20" class:opacity-60={pending}>
    <div class="flex min-w-0 flex-col gap-1">
        <h2 class="m-0 text-title text-ink">Our submission</h2>
        <span class="text-xs text-ink-3">
            Your team's entry. Saving replaces it for everyone who reads it.
        </span>
    </div>

    <!-- A failure that never reached a team (a malformed form) has no card to
         sit in, so it is reported here rather than swallowed. -->
    {#if form?.message && !form?.teamId}
        <p
            class="m-0 rounded-card border border-danger/40 bg-danger/10 px-3 py-2 text-xs
                   text-danger-ink"
            role="alert"
        >
            {form.message}
        </p>
    {/if}

    <!-- Ahead of the empty state, because the two say opposite things about the
         same blank page: "not on a team" is a fact about the reader, and this is
         an admission that we have not been told. Submissions hang off a team, so
         with assignments unpublished there is nothing to hang them on — see the
         TODO in the load. -->
    {#if !data.teamsPublished}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            Team assignments have not been published for this hackathon yet, so there is
            nothing here to submit against. This opens with "See team assignments" in the
            hackathon's settings.
        </p>
    {:else if data.groups.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            You are not on a team yet, so there is nothing to submit.
        </p>
    {:else}
        {#each data.groups as group (group.teamId)}
            <div class="card card-raised box-border flex w-full flex-col gap-3 px-5 py-4">
                <div class="flex flex-col gap-1.5">
                    <h3 class="m-0 text-sm leading-snug text-ink">
                        {group.teamName}
                    </h3>
                    <span class="text-xs text-ink-3">{group.projectTitle}</span>
                </div>

                {#if form?.message && form?.teamId === group.teamId}
                    <p
                        class="m-0 rounded-card border border-danger/40 bg-danger/10 px-3 py-2
                               text-xs text-danger-ink"
                        role="alert"
                    >
                        {form.message}
                    </p>
                {:else if form?.success && form?.teamId === group.teamId}
                    <p
                        class="m-0 rounded-card border border-success/40 bg-success/10 px-3 py-2
                               text-xs text-success-ink"
                        role="status"
                    >
                        {form.unchanged ? 'Nothing changed, so nothing was saved.' : 'Saved.'}
                    </p>
                {/if}

                {#if data.maySubmit}
                    <form
                        method="POST"
                        action="?/saveSubmission"
                        class="flex flex-col gap-3 border-t border-line pt-3"
                        use:enhance={() => {
                            pending = true;
                            return async ({ update }) => {
                                // Not reset: the fields start from the saved
                                // entry, and after a save that is what was just
                                // typed — clearing them would lose it, or, when
                                // the save failed, the work itself.
                                await update({ reset: false });
                                pending = false;
                            };
                        }}
                    >
                        <input type="hidden" name="teamId" value={group.teamId} />
                        <input type="hidden" name="projectId" value={group.projectId} />
                        <!-- None is required on its own; the action refuses only a
                             save with all three empty. -->
                        <label class="field-label">
                            Repository link
                            <input
                                type="url"
                                name="repositoryUrl"
                                maxlength={2048}
                                value={prefillLink(group.entry?.repositoryUrl)}
                                placeholder="https://github.com/your-team/your-repo"
                                class="field h-8 px-2 text-xs"
                            />
                        </label>
                        <label class="field-label">
                            Attachments folder link
                            <input
                                type="url"
                                name="attachmentFolderUrl"
                                maxlength={2048}
                                value={prefillLink(group.entry?.attachmentFolderUrl)}
                                placeholder="https://drive.example.org/your-slides-and-data"
                                class="field h-8 px-2 text-xs"
                            />
                        </label>
                        <div class="field-label">
                            <label for="submission-description-{group.teamId}">
                                Description
                            </label>
                            <MarkdownEditor
                                id="submission-description-{group.teamId}"
                                name="description"
                                rows={6}
                                maxlength={10000}
                                value={group.entry?.description ?? ''}
                                placeholder="What did you build, and how do the pieces fit together?"
                            />
                        </div>
                        <div class="flex flex-wrap items-center gap-3">
                            <button type="submit" class="btn btn-sm btn-primary" disabled={pending}>
                                Save
                            </button>
                            {@render lastSaved(group.entry)}
                        </div>
                    </form>
                {:else}
                    <!-- Closed: the entry as it stands, read only. -->
                    <div class="flex flex-col gap-2 border-t border-line pt-3">
                        <p class="m-0 text-xs text-ink-3">
                            Submissions are closed for this hackathon, so this can no longer be
                            changed.
                        </p>
                        {#if group.entry}
                            <SubmissionContent
                                repositoryUrl={group.entry.repositoryUrl}
                                attachmentFolderUrl={group.entry.attachmentFolderUrl}
                                description={group.entry.description}
                            />
                        {/if}
                        {@render lastSaved(group.entry)}
                    </div>
                {/if}
            </div>
        {/each}
    {/if}
</div>
