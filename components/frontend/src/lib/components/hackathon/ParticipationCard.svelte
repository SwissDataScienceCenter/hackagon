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
        membershipLabel,
    }: {
        teamName: string;
        teamRole: string;
        teamMemberCount: number;
        projectName: string;
        projectTrack: string;
        projectStatus: string;
        nextAction: string;
        nextActionHref: string;
        /**
         * TODO(backend: proposal-deadlines): unset by the overview page. Nothing
         * in the API says when proposals close — deadlines live in phases, and
         * which phase gates which action is not expressed anywhere yet. The card
         * omits the line rather than inventing "Closes in 12 days".
         */
        deadline?: string;
        /** "Registered" or "Waitlisted", from the viewer's own membership row. */
        membershipLabel: string;
    } = $props();
</script>

<div class="card preset-outlined-surface-200-800 p-5">
    <div class="mb-4 flex items-center justify-between">
        <h2 class="text-base font-bold">Your Participation</h2>
        <span class="badge preset-filled-primary-500 text-xs font-bold uppercase">
            {membershipLabel}
        </span>
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
            <span class="text-xs text-surface-500">Your role: {teamRole}</span>
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
            <!-- eslint-disable svelte/no-navigation-without-resolve -- demo placeholder href -->
            <a href={nextActionHref} class="btn btn-sm w-full preset-filled-primary-500 no-underline md:w-auto">
                <ArrowRight class="h-3.5 w-3.5" />
                {nextAction}
            </a>
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
            {#if deadline}
                <span class="text-xs text-warning-500 md:text-end">{deadline}</span>
            {/if}
        </div>
    </div>
</div>
