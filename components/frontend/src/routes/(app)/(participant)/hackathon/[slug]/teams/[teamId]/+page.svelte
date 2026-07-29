<script lang="ts">
    import { resolve } from '$app/paths';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import { projectStatusLabel, projectStatusBadgePreset } from '$lib/utils/projectStatus';
    import { submissionStatusLabel, submissionStatusBadgePreset } from '$lib/utils/submissionStatus';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    const team = $derived(data.team);
    const project = $derived(data.project);

    function initials(displayName: string, username: string): string {
        const source = displayName.trim() || username;
        return source
            .split(' ')
            .filter(Boolean)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    }

    function formatDate(d: Date | undefined): string {
        if (!d) return '';
        return d.toLocaleDateString('en-CH', { day: 'numeric', month: 'short', year: 'numeric' });
    }
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <a
        href={resolve(`/hackathon/${data.slug}/teams`)}
        class="w-fit text-xs font-semibold text-primary-700-300 no-underline hover:underline"
    >
        &larr; Back to teams
    </a>

    <div class="card preset-outlined-surface-200-800 flex w-full flex-col gap-4 p-5">
        <div class="flex flex-wrap items-center gap-3">
            <h2 class="m-0 text-lg font-bold text-surface-950-50">{team.name}</h2>
            {#if project}
                <a
                    href={resolve(`/hackathon/${data.slug}/proposals/${project.id}`)}
                    class="badge {projectStatusBadgePreset(project.status) ?? 'preset-tonal-surface'} no-underline"
                >
                    {project.title} · {projectStatusLabel(project.status) ?? 'Unknown'}
                </a>
            {/if}
        </div>

        {#if team.description}
            <MarkdownContent content={team.description} />
        {:else}
            <p class="m-0 text-sm text-surface-500">No description provided.</p>
        {/if}
    </div>

    <div class="card preset-outlined-surface-200-800 flex w-full flex-col gap-3 p-5">
        <div class="flex items-center justify-between">
            <h3 class="m-0 text-sm font-bold text-surface-950-50">Members</h3>
            <span class="text-xs text-surface-500">
                {team.members.length} member{team.members.length === 1 ? '' : 's'}
            </span>
        </div>

        {#if team.members.length === 0}
            <p class="m-0 text-xs text-surface-500">No members assigned yet.</p>
        {:else}
            <div class="flex flex-wrap gap-4">
                {#each team.members as member (member.id)}
                    <div class="flex w-16 min-w-0 max-w-16 flex-col items-center gap-1">
                        <div
                            class="flex size-9 shrink-0 items-center justify-center rounded-full
                                   border-2 border-surface-200-800 bg-surface-200-800 text-xs
                                   font-bold text-surface-950-50"
                        >
                            {initials(member.displayName, member.username)}
                        </div>
                        <span
                            class="line-clamp-2 w-full min-w-0 break-words text-center text-xs
                                   leading-tight text-surface-500"
                            title={member.displayName || member.username}
                        >
                            {member.displayName || member.username}
                        </span>
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <div class="card preset-outlined-surface-200-800 flex w-full flex-col gap-3 p-5">
        <h3 class="m-0 text-sm font-bold text-surface-950-50">Submissions</h3>

        {#if team.submissions.length === 0}
            <p class="m-0 text-xs text-surface-500">No submissions yet.</p>
        {:else}
            {#each team.submissions as submission (submission.id)}
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
        {/if}
    </div>
</div>
