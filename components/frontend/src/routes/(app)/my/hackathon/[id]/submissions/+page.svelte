<script lang="ts">
    import type { PageData } from './$types';
    import {
        submissionStatusLabel,
        submissionStatusBadgeVariant,
    } from '$lib/utils/submissionStatus';

    let { data }: { data: PageData } = $props();

    function formatDate(d: Date | undefined): string {
        if (!d) return '';
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }
</script>

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/projects). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-1">
        <h2 class="m-0 text-lg font-bold text-ink">Submissions</h2>
        <span class="text-xs text-ink-3">Your team's submitted work</span>
    </div>

    {#if data.groups.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            You are not on a team yet, so there is nothing to submit.
        </p>
    {:else}
        {#each data.groups as group (group.teamId)}
            <div
                class="box-border w-full border border-line bg-raised
                       px-5 py-4"
            >
                <div class="flex flex-col gap-1.5">
                    <h3 class="m-0 text-sm font-bold leading-snug text-ink">
                        {group.teamName}
                    </h3>
                    <span class="text-xs text-ink-3">{group.projectTitle}</span>
                </div>

                {#if !group.latest}
                    <p class="mt-3 mb-0 text-xs text-ink-3">
                        No submission yet.
                    </p>
                {:else}
                    <div class="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="text-xs font-semibold text-ink">
                                Version {group.latest.version}
                            </span>
                            <span
                                class="badge {submissionStatusBadgeVariant(group.latest.status) ??
                                    'badge-neutral'} text-xs"
                            >
                                {submissionStatusLabel(group.latest.status) ?? 'Unknown'}
                            </span>
                            <span class="text-xs text-ink-3">
                                {formatDate(group.latest.modifiedAt ?? group.latest.createdAt)}
                            </span>
                        </div>
                        {#if group.latest.result}
                            <p class="m-0 text-xs leading-snug text-ink-2">
                                {group.latest.result}
                            </p>
                        {/if}
                    </div>

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
                                            ) ?? 'badge-neutral'} text-xs"
                                        >
                                            {submissionStatusLabel(submission.status) ?? 'Unknown'}
                                        </span>
                                        <span class="text-xs text-ink-3">
                                            {formatDate(submission.modifiedAt ?? submission.createdAt)}
                                        </span>
                                    </li>
                                {/each}
                            </ul>
                        </details>
                    {/if}
                {/if}
            </div>
        {/each}
    {/if}
</div>
