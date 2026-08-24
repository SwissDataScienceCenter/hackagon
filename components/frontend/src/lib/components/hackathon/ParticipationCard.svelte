<script lang="ts">
    import { ArrowRight, TriangleAlert } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import { membershipBadgeVariant } from '$lib/utils/hackathonRole';

    /** Avatars shown before the rest collapse into a "+N" bubble. */
    const AVATAR_LIMIT = 5;

    let {
        hackathonId,
        teamName,
        teamRole,
        memberNames,
        projectName,
        projectTrack,
        projectStatus,
        submissionCount,
        canSubmit,
        membershipLabel,
        membershipIsWaiting,
    }: {
        hackathonId: string;
        teamName: string;
        teamRole: string;
        /**
         * Every member's display name, in the order the backend returned them.
         *
         * Names rather than a count: the count drew anonymous grey circles, which
         * told a participant nothing they did not already know about their own
         * team. `Team.members` are full `User`s, so initials cost nothing.
         */
        memberNames: string[];
        projectName: string;
        projectTrack: string;
        /** Null while there is no status worth naming — see $lib/utils/projectStatus. */
        projectStatus: string | null;
        /** Submissions the team has handed in, from `Team.submissions`. */
        submissionCount: number;
        /**
         * Whether `CAPABILITY_CREATE_PROJECT_SUBMISSIONS` is switched on.
         *
         * Decides between a call to action and a statement of fact: with
         * submissions closed, "no submission yet" is not something the viewer can
         * do anything about, and offering a button that leads to a refusal is
         * worse than offering none.
         */
        canSubmit: boolean;
        /** "Registered" or "Waitlisted", from the viewer's own membership row. */
        membershipLabel: string;
        /** Drives the badge colour. Separate from the label so the hue does not
         *  depend on the wording. */
        membershipIsWaiting: boolean;
    } = $props();

    /**
     * Up to two initials from a display name.
     *
     * `displayName` is free text and can be a single word, an email local part or
     * empty, so this takes what it can get and falls back to a dash rather than
     * rendering an empty circle.
     */
    function initials(name: string): string {
        const words = name.trim().split(/\s+/).filter(Boolean);
        // Indexed access is checked here (`noUncheckedIndexedAccess`), so each
        // lookup is narrowed rather than asserted — `words[0]` on an empty array
        // is exactly the case the dash exists for.
        const first = words[0];
        if (!first) return '–';
        const last = words.length > 1 ? words[words.length - 1] : undefined;
        if (!last) return first.slice(0, 2).toUpperCase();

        return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
    }

    const shown = $derived(memberNames.slice(0, AVATAR_LIMIT));
    const overflow = $derived(Math.max(0, memberNames.length - AVATAR_LIMIT));
    const memberSummary = $derived(
        memberNames.length === 1 ? '1 member' : `${memberNames.length} members`,
    );
    const needsSubmission = $derived(submissionCount === 0);
</script>

<!--
  The viewer's own stake in the hackathon: who they are with, what they are
  building, and the one thing left to do about it.

  The submission line is what makes this a card worth reading twice. Everything
  else here is settled by the time a hackathon starts; whether the team has
  actually handed anything in is the fact that changes, and the fact nobody wants
  to discover late.
-->
<section class="card flex flex-col gap-4 p-5" aria-labelledby="your-participation">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="m-0 text-section" id="your-participation">Your team</h2>
        <span class="badge {membershipBadgeVariant(membershipIsWaiting)}">
            {membershipLabel}
        </span>
    </div>

    <div class="flex flex-col gap-1.5">
        <span class="meta">Team</span>
        <span class="text-sm font-semibold">{teamName}</span>
        <!-- A list, so a screen reader reads the members out rather than
             announcing five decorative circles. -->
        <ul class="m-0 flex list-none flex-wrap items-center gap-y-1 -space-x-1.5 p-0">
            <!-- Keyed by position, not by name: two people can carry the same
                 display name and a duplicate key is a runtime error. -->
            {#each shown as name, i (i)}
                <li
                    class="flex h-6 w-6 items-center justify-center rounded-full bg-overlay
                           text-[0.6rem] font-semibold text-ink-2 ring-2 ring-surface"
                    title={name}
                >
                    <span aria-hidden="true">{initials(name)}</span>
                    <span class="sr-only">{name}</span>
                </li>
            {/each}
            {#if overflow > 0}
                <li
                    class="tnum flex h-6 w-6 items-center justify-center rounded-full bg-raised
                           text-[0.6rem] font-semibold text-ink-3 ring-2 ring-surface"
                >
                    +{overflow}
                </li>
            {/if}
        </ul>
        <span class="text-xs text-ink-3">{memberSummary} · your role: {teamRole}</span>
    </div>

    <div class="flex flex-col gap-1.5 border-t border-line pt-4">
        <span class="meta">Project</span>
        <span class="text-sm font-semibold">{projectName}</span>
        <span class="text-xs text-accent-ink">Track: {projectTrack}</span>
        {#if projectStatus}
            <span class="text-xs text-ink-3">Status: {projectStatus}</span>
        {/if}
    </div>

    <div class="flex flex-col gap-2 border-t border-line pt-4">
        <span class="meta">Submission</span>
        {#if needsSubmission && canSubmit}
            <span class="flex items-center gap-1.5 text-xs font-semibold text-warning-ink">
                <TriangleAlert class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Nothing handed in yet
            </span>
            <!-- The one solid accent on this page. Of everything the overview
                 offers, this is the single thing with a deadline attached. -->
            <a
                href={resolve(`/my/hackathon/${hackathonId}/submissions`)}
                class="btn btn-sm btn-solid w-full no-underline sm:w-auto sm:self-start"
            >
                Submit your work
                <ArrowRight class="h-3.5 w-3.5" aria-hidden="true" />
            </a>
        {:else if needsSubmission}
            <span class="text-xs text-ink-3">
                Nothing handed in yet — submissions are not open.
            </span>
        {:else}
            <span class="tnum text-xs text-success-ink">
                {submissionCount === 1 ? '1 submission' : `${submissionCount} submissions`} handed in
            </span>
        {/if}
    </div>
</section>
