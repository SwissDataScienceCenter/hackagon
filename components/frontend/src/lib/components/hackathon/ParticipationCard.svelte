<script lang="ts">
    import { ArrowRight } from 'lucide-svelte';
    import { membershipBadgeVariant } from '$lib/utils/hackathonStatus';

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
        membershipIsWaiting,
    }: {
        teamName: string;
        teamRole: string;
        teamMemberCount: number;
        projectName: string;
        projectTrack: string;
        projectStatus: string;
        /**
         * The one thing to do next. Both are unset by the overview page: no
         * participant mutation exists yet, so every candidate action ("Set
         * Preferences", "Propose a Project") could only link to an anchor that
         * goes nowhere. The column is hidden until there is a real destination.
         */
        nextAction?: string;
        nextActionHref?: string;
        /**
         * TODO(backend: proposal-deadlines): unset by the overview page. Nothing
         * in the API says when proposals close — deadlines live in phases, and
         * which phase gates which action is not expressed anywhere yet. The card
         * omits the line rather than inventing "Closes in 12 days".
         */
        deadline?: string;
        /** "Registered" or "Waitlisted", from the viewer's own membership row. */
        membershipLabel: string;
        /** Drives the badge colour. Separate from the label so the hue does not
         *  depend on the wording. */
        membershipIsWaiting: boolean;
    } = $props();
</script>

<div class="card p-5">
    <div class="mb-4 flex items-center justify-between">
        <h2 class="text-section">Your Participation</h2>
        <span class="badge {membershipBadgeVariant(membershipIsWaiting)}">
            {membershipLabel}
        </span>
    </div>

    <div class="flex flex-col gap-6 md:flex-row md:gap-8">
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <span class="meta">Team</span>
            <span class="text-sm font-semibold">{teamName}</span>
            <div class="flex -space-x-1.5">
                {#each Array.from({ length: teamMemberCount }, (_, i) => i) as i (i)}
                    <div class="h-6 w-6 rounded-full bg-overlay ring-2 ring-surface"></div>
                {/each}
            </div>
            <span class="text-xs text-ink-3">Your role: {teamRole}</span>
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <span class="meta">Project</span>
            <span class="text-sm font-semibold">{projectName}</span>
            <span class="text-xs text-accent-ink">Track: {projectTrack}</span>
            <span class="text-xs text-ink-3">Status: {projectStatus}</span>
        </div>

        {#if nextAction && nextActionHref}
            <div
                class="flex flex-col gap-2 border-t border-line pt-4 md:min-w-[10rem] md:items-end
                       md:border-0 md:pt-0"
            >
                <span class="meta">Next step</span>
                <!-- eslint-disable svelte/no-navigation-without-resolve -- caller-supplied destination -->
                <a href={nextActionHref} class="btn btn-sm w-full btn-solid no-underline md:w-auto">
                    <ArrowRight class="h-3.5 w-3.5" />
                    {nextAction}
                </a>
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
                {#if deadline}
                    <span class="text-xs text-warning-ink md:text-end">{deadline}</span>
                {/if}
            </div>
        {/if}
    </div>
</div>
