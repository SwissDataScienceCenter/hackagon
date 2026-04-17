<script lang="ts">
    import { ArrowRight } from 'lucide-svelte';

    let {
        teamName,
        teamRole,
        teamMemberCount,
        projectName,
        projectTrack,
        projectStatus,
        nextAction,
        nextActionHref,
        deadline,
    }: {
        teamName: string;
        teamRole: string;
        teamMemberCount: number;
        projectName: string;
        projectTrack: string;
        projectStatus: string;
        nextAction: string;
        nextActionHref: string;
        deadline: string;
    } = $props();
</script>

<div class="card preset-outlined-surface-200-800 p-5">
    <div class="mb-4 flex items-center justify-between">
        <h2 class="text-base font-bold">Your Participation</h2>
        <span class="badge preset-filled-primary-500 text-xs font-bold">REGISTERED</span>
    </div>

    <div class="flex gap-8">
        <div class="flex flex-1 flex-col gap-1.5">
            <span class="text-xs font-bold tracking-widest text-surface-500">TEAM</span>
            <span class="text-sm font-semibold">{teamName}</span>
            <div class="flex -space-x-1.5">
                {#each Array(teamMemberCount) as _, i (i)}
                    <div class="h-6 w-6 rounded-full bg-surface-200 ring-2 ring-surface-50 dark:bg-surface-700 dark:ring-surface-900"></div>
                {/each}
            </div>
            <span class="text-xs text-surface-500">Your role: {teamRole}</span>
        </div>

        <div class="flex flex-1 flex-col gap-1.5">
            <span class="text-xs font-bold tracking-widest text-surface-500">PROJECT</span>
            <span class="text-sm font-semibold">{projectName}</span>
            <span class="text-xs text-primary-700 dark:text-primary-500">Track: {projectTrack}</span>
            <span class="text-xs text-surface-500">Status: {projectStatus}</span>
        </div>

        <div class="flex flex-col items-end gap-2">
            <span class="text-xs font-bold tracking-widest text-surface-500">NEXT STEP</span>
            <a href={nextActionHref} class="btn btn-sm preset-filled-primary-500 no-underline">
                <ArrowRight class="h-3.5 w-3.5" />
                {nextAction}
            </a>
            <span class="text-xs text-warning-500">{deadline}</span>
        </div>
    </div>
</div>
