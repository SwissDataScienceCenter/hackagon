<script lang="ts">
    import { resolve } from '$app/paths';
    import SubmissionContent from '$lib/components/hackathon/SubmissionContent.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

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

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/projects). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-1">
        <h2 class="m-0 text-title text-ink">Submissions</h2>
        {#if data.teamCount > 0}
            <span class="text-xs text-ink-3">
                {data.entries.length} of {data.teamCount}
                {data.teamCount === 1 ? 'team has' : 'teams have'} submitted
            </span>
        {/if}
    </div>

    <div class="flex w-full flex-col items-stretch gap-2">
        {#if !data.teamsPublished}
            <p class="m-0 py-6 text-center text-sm text-ink-3">
                Team assignments have not been published for this hackathon yet, so there are
                no submissions to show.
            </p>
        {:else if data.teamCount === 0}
            <p class="m-0 py-6 text-center text-sm text-ink-3">
                No teams have been formed in this hackathon yet.
            </p>
        {:else if data.entries.length === 0}
            <p class="m-0 py-6 text-center text-sm text-ink-3">No team has submitted yet.</p>
        {:else}
            {#each data.entries as e (e.teamId)}
                <div class="card card-raised box-border flex w-full flex-col gap-2 px-5 py-4">
                    <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <div class="flex min-w-0 flex-col gap-0.5">
                            <h3 class="m-0 text-sm leading-snug text-ink">{e.projectTitle}</h3>
                            <span class="text-xs text-ink-3">
                                {e.teamName}{#if e.isOwn} · your team{/if}
                            </span>
                        </div>
                        <div class="flex shrink-0 items-center gap-2">
                            {#if e.isOwn}
                                <a
                                    href={resolve(
                                        `/my/hackathon/${data.hackathonId}/submissions/mine`
                                    )}
                                    class="btn btn-sm btn-ghost no-underline"
                                >
                                    Our submission
                                </a>
                            {/if}
                            <!-- `?from=teams` so the team's page offers a way back to
                                 the teams list rather than to the ballot. -->
                            <a
                                href="{resolve(
                                    `/my/hackathon/${data.hackathonId}/teams/${e.teamId}`
                                )}?from=teams"
                                class="btn btn-sm btn-ghost no-underline"
                            >
                                View team
                            </a>
                        </div>
                    </div>

                    <!-- Description folded: one long one would push every team
                         below it down a page that exists to scan many teams. -->
                    <div class="flex flex-col gap-1 border-t border-line pt-2">
                        <SubmissionContent
                            repositoryUrl={e.repositoryUrl}
                            attachmentFolderUrl={e.attachmentFolderUrl}
                            description={e.description}
                            collapseDescription
                        />
                        <span class="text-xs text-ink-3">
                            Last updated {formatDate(e.updatedAt)}{#if e.updatedBy}
                                by {e.updatedBy}{/if}
                        </span>
                    </div>
                </div>
            {/each}
        {/if}
    </div>
</div>
