<script lang="ts">
    import type { ActionData, PageData } from './$types';
    import SubmissionContent from '$lib/components/hackathon/SubmissionContent.svelte';
    import SubmissionForm from '$lib/components/hackathon/SubmissionForm.svelte';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Derived from the load's return shape rather than restated, so the two
    // can't drift.
    type Entry = PageData['groups'][number]['entry'];

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
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
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

                {#if data.maySubmit}
                    <!-- The action's answer goes only to the team it was about. -->
                    {@const mine = form?.teamId === group.teamId}
                    <SubmissionForm
                        teamId={group.teamId}
                        projectId={group.projectId}
                        saved={group.entry}
                        outcome={mine && form?.success
                            ? form.unchanged
                                ? 'unchanged'
                                : 'saved'
                            : undefined}
                        message={mine ? form?.message : undefined}
                    />
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
