<script lang="ts">
    import { submissionSummary } from '$lib/utils/submissionStatus';
    import type { CapabilityInfo } from '$lib/utils/capabilities';

    let {
        teamName,
        teamMemberCount,
        projectName,
        projectTrack,
        projectStatus,
        submissionStatus,
        submitProject,
    }: {
        teamName: string;
        teamMemberCount: number;
        projectName: string;
        projectTrack: string;
        projectStatus: string;
        /** SubmissionStatus of the team's current submission; absent if none. */
        submissionStatus?: number;
        /** The `submit_project` capability, which decides whether the status
         *  above is a to-do, a deadline or a record. */
        submitProject: CapabilityInfo;
    } = $props();

    const submission = $derived(submissionSummary(submissionStatus, submitProject));

    const TONE_CLASS = {
        success: 'text-success-700-300',
        warning: 'text-warning-700-300',
        muted: 'text-surface-500',
    };
</script>

<div class="card preset-outlined-surface-200-800 p-5">
    <div class="mb-4 flex items-center justify-between">
        <h2 class="text-base font-bold">Your Participation</h2>
        <span class="badge preset-filled-primary-500 text-xs font-bold">REGISTERED</span>
    </div>

    <div class="flex flex-col gap-6 md:flex-row md:gap-8">
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <span class="text-xs font-bold tracking-widest text-surface-500">TEAM</span>
            <span class="text-sm font-semibold">{teamName}</span>
            <div class="flex -space-x-1.5">
                {#each Array.from({ length: teamMemberCount }, (_, i) => i) as i (i)}
                    <div class="h-6 w-6 rounded-full bg-surface-200-800 ring-2 ring-surface-50-950"></div>
                {/each}
            </div>
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <span class="text-xs font-bold tracking-widest text-surface-500">PROJECT</span>
            <span class="text-sm font-semibold">{projectName}</span>
            <span class="text-xs text-primary-700-300">Track: {projectTrack}</span>
            <span class="text-xs text-surface-500">Status: {projectStatus}</span>
        </div>

        <!-- Where NEXT STEP used to be. It was hardcoded to "View Team" while the
             "What now" card above computed the real one from capabilities, so the
             page could recommend two different things at once. One CTA, at the
             top; this slot now answers the question a member actually has here. -->
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <span class="text-xs font-bold tracking-widest text-surface-500">SUBMISSION</span>
            <span class="text-sm font-semibold {TONE_CLASS[submission.tone]}">
                {submission.label}
            </span>
            {#if submission.detail}
                <span class="text-xs text-surface-500">{submission.detail}</span>
            {/if}
        </div>
    </div>
</div>
