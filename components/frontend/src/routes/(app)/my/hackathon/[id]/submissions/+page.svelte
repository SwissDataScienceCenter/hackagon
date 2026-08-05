<script lang="ts">
    import { enhance } from '$app/forms';
    import type { ActionData, PageData } from './$types';
    import {
        submissionStatusLabel,
        submissionStatusBadgeVariant,
    } from '$lib/utils/submissionStatus';

    let { data, form }: { data: PageData; form: ActionData } = $props();

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

    // `result` is free text (README says "e.g. a URL", but nothing enforces
    // it) — only linkify it when it actually parses as http(s), so a team that
    // wrote a plain description doesn't get a dead link.
    function isHttpUrl(value: string): boolean {
        try {
            const u = new URL(value);
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
            return false;
        }
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

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/projects). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20" class:opacity-60={pending}>
    <div class="flex min-w-0 flex-col gap-1">
        <h2 class="m-0 text-title text-ink">Submissions</h2>
        <span class="text-xs text-ink-3">Your team's submitted work</span>
    </div>

    {#if form?.message}
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
            <div class="card card-raised box-border w-full px-5 py-4">
                <div class="flex flex-col gap-1.5">
                    <h3 class="m-0 text-sm leading-snug text-ink">
                        {group.teamName}
                    </h3>
                    <span class="text-xs text-ink-3">{group.projectTitle}</span>
                </div>

                {#if !group.latest}
                    <p class="mt-3 mb-0 text-xs text-ink-3">
                        No submission yet.
                    </p>
                {:else}
                    {#if group.latestFinal}
                        <div class="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="text-xs font-semibold text-ink">
                                    Version {group.latestFinal.version}
                                </span>
                                <span
                                    class="badge {submissionStatusBadgeVariant(
                                        group.latestFinal.status
                                    ) ?? 'badge-neutral'}"
                                >
                                    {submissionStatusLabel(group.latestFinal.status) ?? 'Unknown'}
                                </span>
                                <span class="text-xs text-ink-3">
                                    {formatDate(
                                        group.latestFinal.modifiedAt ?? group.latestFinal.createdAt
                                    )}
                                    {#if group.latestFinal.creator}
                                        · by {group.latestFinal.creator}
                                    {/if}
                                </span>
                            </div>
                            {#if group.latestFinal.result}
                                {@render resultLine(group.latestFinal.result)}
                            {/if}
                        </div>
                    {/if}

                    {#if group.latest.id !== group.latestFinal?.id}
                        <div class="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="text-xs font-semibold text-ink">
                                    {group.latestFinal ? 'Newer draft' : 'Draft'} — version {group.latest.version}
                                </span>
                                <span
                                    class="badge {submissionStatusBadgeVariant(group.latest.status) ??
                                        'badge-neutral'}"
                                >
                                    {submissionStatusLabel(group.latest.status) ?? 'Unknown'}
                                </span>
                                <span class="text-xs text-ink-3">
                                    {formatDate(group.latest.modifiedAt ?? group.latest.createdAt)}
                                    {#if group.latest.creator}
                                        · by {group.latest.creator}
                                    {/if}
                                </span>
                            </div>
                            {#if group.latest.result}
                                {@render resultLine(group.latest.result)}
                            {/if}
                            {#if group.maySubmit}
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
                                    <input type="hidden" name="submissionId" value={group.latest.id} />
                                    <button type="submit" class="btn btn-sm btn-primary" disabled={pending}>
                                        Finalize this version
                                    </button>
                                </form>
                            {/if}
                        </div>
                    {/if}

                    {#if group.earlier.length > 0}
                        <details class="mt-3 border-t border-line pt-3">
                            <summary class="cursor-pointer text-xs text-ink-3">
                                {group.earlier.length === 1
                                    ? '1 earlier version'
                                    : `${group.earlier.length} earlier versions`}
                            </summary>
                            <ul class="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
                                {#each group.earlier as submission (submission.id)}
                                    <li class="flex flex-wrap items-center gap-2">
                                        <span class="text-xs text-ink-2">
                                            Version {submission.version}
                                        </span>
                                        <span
                                            class="badge {submissionStatusBadgeVariant(
                                                submission.status
                                            ) ?? 'badge-neutral'}"
                                        >
                                            {submissionStatusLabel(submission.status) ?? 'Unknown'}
                                        </span>
                                        <span class="text-xs text-ink-3">
                                            {formatDate(submission.modifiedAt ?? submission.createdAt)}
                                            {#if submission.creator}
                                                · by {submission.creator}
                                            {/if}
                                        </span>
                                    </li>
                                {/each}
                            </ul>
                        </details>
                    {/if}
                {/if}

                {#if group.maySubmit}
                    <form
                        method="POST"
                        action="?/createSubmission"
                        class="mt-3 flex flex-col gap-2 border-t border-line pt-3"
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
                                {group.latest
                                    ? 'Submit a new version'
                                    : 'Submission link or notes'}
                            </span>
                            <input
                                type="text"
                                name="result"
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
                {/if}
            </div>
        {/each}
    {/if}
</div>
