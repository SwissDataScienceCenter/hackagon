<script lang="ts">
    import { resolve } from '$app/paths';
    import { submissionStatusLabel, submissionStatusBadgePreset } from '$lib/utils/submissionStatus';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    const team = $derived(data.team);
    const project = $derived(data.project);
    const submissions = $derived(data.submissions);

    function formatDate(d: Date | undefined): string {
        if (!d) return '';
        return d.toLocaleDateString('en-CH', { day: 'numeric', month: 'short', year: 'numeric' });
    }
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <h2 class="m-0 text-lg font-bold text-surface-950-50">Submissions</h2>

    {#if !team}
        <p class="m-0 text-sm text-surface-500">
            You're not on a team yet — join a team to submit your project.
        </p>
    {:else}
        <div class="flex flex-wrap items-center gap-3">
            <a
                href={resolve(`/hackathon/${data.slug}/teams/${team.id}`)}
                class="text-sm font-semibold text-primary-700-300 no-underline hover:underline"
            >
                {team.name}
            </a>
            {#if project}
                <span class="text-xs text-surface-500">{project.title}</span>
            {/if}
        </div>

        {#if submissions.length === 0}
            <p class="m-0 text-xs text-surface-500">No submissions yet.</p>
        {:else}
            <div class="card preset-outlined-surface-200-800 flex w-full flex-col gap-3 p-5">
                {#each submissions as submission (submission.id)}
                    <div class="flex flex-col gap-1 border-t border-surface-200-800 pt-3 first:border-0 first:pt-0">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="badge {submissionStatusBadgePreset(submission.status) ?? 'preset-tonal-surface'}">
                                {submissionStatusLabel(submission.status) ?? 'Unknown'}
                            </span>
                            <span class="text-xs text-surface-500">
                                v{submission.version} · {formatDate(submission.createdAt)}
                            </span>
                        </div>
                        {#if submission.result}
                            <p class="m-0 text-xs leading-relaxed text-surface-600-400">{submission.result}</p>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    {/if}
</div>
