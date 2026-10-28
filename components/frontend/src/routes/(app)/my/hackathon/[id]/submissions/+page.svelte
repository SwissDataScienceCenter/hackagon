<script lang="ts">
    import { enhance } from '$app/forms';
    import type { ActionData, PageData } from './$types';
    import {
        submissionStatusLabel,
        submissionStatusBadgeVariant,
    } from '$lib/utils/submissionStatus';
    import { isHttpUrl, isHttpsUrl } from '$lib/utils/url';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Derived from the load's return shape rather than restated, so the two
    // can't drift.
    type Version = NonNullable<PageData['groups'][number]['latest']>;

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
     * A link from the latest version, to start the next one from — or nothing,
     * when it is notes from before the backend required https. Prefilling those
     * would have the form refuse its own starting value.
     */
    function prefillLink(value: string | undefined): string {
        return value && isHttpsUrl(value) ? value : '';
    }
</script>

{#snippet linkLine(label: string, value: string)}
    <p class="m-0 text-xs leading-snug">
        <span class="text-ink-3">{label}:</span>
        {#if isHttpUrl(value)}
            <!-- eslint-disable svelte/no-navigation-without-resolve -- team-provided external URL -->
            <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                class="break-all text-accent-ink hover:underline"
            >
                {value}
            </a>
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
        {:else}
            <!-- Notes typed into the link field before it had to be one. -->
            <span class="break-words text-ink-2">{value}</span>
        {/if}
    </p>
{/snippet}

{#snippet version(v: Version, heading: string)}
    <div class="flex flex-col gap-1 border-t border-line pt-3">
        <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold text-ink">{heading}</span>
            <span class="badge {submissionStatusBadgeVariant(v.status) ?? 'badge-neutral'}">
                {submissionStatusLabel(v.status) ?? 'Unknown'}
            </span>
        </div>
        <span class="text-xs text-ink-3">
            Submitted {formatDate(v.createdAt)}{#if v.creator} by {v.creator}{/if}
        </span>
        {#if v.finalizedAt}
            <span class="text-xs text-ink-3">
                Finalized {formatDate(v.finalizedAt)}{#if v.finalizedBy} by {v.finalizedBy}{/if}
            </span>
        {/if}
        {#if v.repositoryUrl}
            {@render linkLine('Repository', v.repositoryUrl)}
        {/if}
        {#if v.attachmentFolderUrl}
            {@render linkLine('Attachments', v.attachmentFolderUrl)}
        {/if}
        {#if v.description}
            <div class="min-w-0 text-xs leading-snug text-ink-2">
                <MarkdownContent content={v.description} />
            </div>
        {/if}
        {#if !v.repositoryUrl && !v.attachmentFolderUrl && !v.description}
            <!-- Said outright: every field is optional on the backend, and a
                 blank version would otherwise be indistinguishable from a
                 broken render. -->
            <p class="m-0 text-xs leading-snug text-ink-3 italic">
                Nothing filled in on this version.
            </p>
        {/if}
    </div>
{/snippet}

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/projects). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20" class:opacity-60={pending}>
    <div class="flex min-w-0 flex-col gap-1">
        <h2 class="m-0 text-title text-ink">Submissions</h2>
        <span class="text-xs text-ink-3">Your team's submitted work</span>
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
                {/if}

                <!-- Entry sits at the top; versions below it run newest first. -->
                {#if data.maySubmit}
                    <form
                        method="POST"
                        action="?/createSubmission"
                        class="flex flex-col gap-3 border-t border-line pt-3"
                        use:enhance={() => {
                            pending = true;
                            return async ({ update }) => {
                                // Not reset: the fields start from the latest
                                // version, and after a save that is what was
                                // just typed — clearing them would lose it.
                                await update({ reset: false });
                                pending = false;
                            };
                        }}
                    >
                        <input type="hidden" name="teamId" value={group.teamId} />
                        <input type="hidden" name="projectId" value={group.projectId} />
                        <span class="text-xs font-semibold text-ink">
                            {group.latest
                                ? 'Submit a new version — starts from your latest one'
                                : 'Submit your work'}
                        </span>
                        <!-- None is required on its own; the action refuses only a
                             version with all three empty. -->
                        <label class="field-label">
                            Repository link
                            <input
                                type="url"
                                name="repositoryUrl"
                                maxlength={2048}
                                value={prefillLink(group.latest?.repositoryUrl)}
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
                                value={prefillLink(group.latest?.attachmentFolderUrl)}
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
                                value={group.latest?.description ?? ''}
                                placeholder="What did you build, and how do the pieces fit together?"
                            />
                        </div>
                        <button
                            type="submit"
                            class="btn btn-sm btn-ghost self-start"
                            disabled={pending}
                        >
                            {group.latest ? 'Save new draft' : 'Save draft'}
                        </button>
                    </form>
                {:else}
                    <p class="m-0 border-t border-line pt-3 text-xs text-ink-3">
                        Submissions are closed for this hackathon, so no new version can be
                        added.
                    </p>
                {/if}

                {#if !group.latest}
                    <p class="m-0 border-t border-line pt-3 text-xs text-ink-3">
                        No submission yet.
                    </p>
                {:else}
                    {#if group.latest.id !== group.latestFinal?.id}
                        <!-- A draft ahead of the team's entry. Kept visually distinct from
                             the final block, since which one counts is not obvious. -->
                        {@render version(
                            group.latest,
                            `${group.latestFinal ? 'Newer draft' : 'Draft'} — version ${group.latest.version}`
                        )}
                        {#if data.mayFinalize}
                            <form
                                method="POST"
                                action="?/finalizeSubmission"
                                use:enhance={() => {
                                    pending = true;
                                    return async ({ update }) => {
                                        await update();
                                        pending = false;
                                    };
                                }}
                            >
                                <input type="hidden" name="teamId" value={group.teamId} />
                                <input
                                    type="hidden"
                                    name="submissionId"
                                    value={group.latest.id}
                                />
                                <button
                                    type="submit"
                                    class="btn btn-sm btn-primary"
                                    disabled={pending}
                                    onclick={(e) => {
                                        // No un-finalize RPC exists — the only way past a
                                        // final version is to submit another draft.
                                        if (
                                            !confirm(
                                                'Finalize this version as your team’s entry? This cannot be undone.'
                                            )
                                        ) {
                                            e.preventDefault();
                                        }
                                    }}
                                >
                                    Finalize this version
                                </button>
                            </form>
                        {/if}
                    {/if}

                    {#if group.latestFinal}
                        {@render version(
                            group.latestFinal,
                            `Your entry — version ${group.latestFinal.version}`
                        )}
                    {/if}

                    {#if group.earlier.length > 0}
                        <details class="border-t border-line pt-3">
                            <summary class="cursor-pointer text-xs text-ink-3">
                                {group.earlier.length === 1
                                    ? '1 earlier version'
                                    : `${group.earlier.length} earlier versions`}
                            </summary>
                            <div class="mt-2 flex flex-col gap-3">
                                {#each group.earlier as submission (submission.id)}
                                    {@render version(
                                        submission,
                                        `Version ${submission.version}`
                                    )}
                                {/each}
                            </div>
                        </details>
                    {/if}
                {/if}
            </div>
        {/each}
    {/if}
</div>
