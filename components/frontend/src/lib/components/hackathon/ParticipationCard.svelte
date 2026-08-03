<script lang="ts">
    import { resolve } from '$app/paths';
    import { ArrowRight } from 'lucide-svelte';

    let {
        teamName,
        teamMemberCount,
        projectName,
        projectTrack,
        projectStatus,
        nextAction,
        nextActionHref,
    }: {
        teamName: string;
        teamMemberCount: number;
        projectName: string;
        projectTrack: string;
        projectStatus: string;
        nextAction: string;
        nextActionHref: string;
    } = $props();
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

        <div
            class="flex flex-col gap-2 border-t border-surface-200-800 pt-4 md:min-w-[10rem] md:items-end
                   md:border-0 md:pt-0"
        >
            <span class="text-xs font-bold tracking-widest text-surface-500">NEXT STEP</span>
            <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic path from page data; resolve() is route-literal typed -->
            <a href={resolve(nextActionHref as any)} class="btn btn-sm w-full preset-filled-primary-500 no-underline md:w-auto">
                <ArrowRight class="h-3.5 w-3.5" />
                {nextAction}
            </a>
        </div>
    </div>
</div>
