<script lang="ts">
    import { enhance } from '$app/forms';
    import type { ActionData, PageData } from './$types';
    import {
        submissionStatusLabel,
        submissionStatusBadgeVariant,
    } from '$lib/utils/submissionStatus';
    import { isHttpUrl } from '$lib/utils/url';

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
</script>

{#snippet resultLine(result: string)}
    {#if isHttpUrl(result)}
        <!-- eslint-disable svelte/no-navigation-without-resolve -- team-provided external URL -->
        <a
            href={result}
            target="_blank"
            rel="noopener noreferrer"
            class="m-0 block text-xs leading-snug break-all text-accent-ink hover:underline"
        >
            {result}
        </a>
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
    {:else}
        <p class="m-0 text-xs leading-snug text-ink-2">{result}</p>
    {/if}
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
        {#if v.result}
            {@render resultLine(v.result)}
        {:else}
            <!-- Said outright: `result` is optional on the backend, and a blank
                 one would otherwise be indistinguishable from a broken render. -->
            <p class="m-0 text-xs leading-snug text-ink-3 italic">
                No link or notes on this version.
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

    {#if data.groups.length === 0}
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
                        class="flex flex-col gap-2 border-t border-line pt-3"
                        use:enhance={() => {
                            pending = true;
                            return async ({ update }) => {
                                await update();
                                pending = false;
                            };
                        }}
                    >
                        <input type="hidden" name="teamId" value={group.teamId} />
                        <input type="hidden" name="projectId" value={group.projectId} />
                        <label class="flex flex-col gap-1">
                            <span class="text-xs text-ink-3">
                                {group.latest ? 'Submit a new version' : 'Submission link or notes'}
                            </span>
                            <input
                                type="text"
                                name="result"
                                required
                                placeholder="https://github.com/your-team/your-repo"
                                class="field h-8 px-2 text-xs"
                            />
                        </label>
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
