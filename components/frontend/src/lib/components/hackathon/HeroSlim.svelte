<script module lang="ts">
    import type { ComponentType } from 'svelte';

    export type HeroBadge = { label: string; preset: string; icon?: ComponentType };
</script>

<script lang="ts">
    import CalendarDays from 'lucide-svelte/icons/calendar-days';

    let {
        title,
        dates,
        badges = [],
        roleBadges = [],
        roleLabel = 'You',
    }: {
        title: string;
        dates: string;
        /** Facts about the hackathon itself — status, visibility. */
        badges?: HeroBadge[];
        /** Facts about the viewer — their role, their teams. */
        roleBadges?: HeroBadge[];
        roleLabel?: string;
    } = $props();
</script>

<section class="bg-surface-100-900 px-4 py-3 sm:px-10 md:px-20">
    <!-- Row 1: the hackathon. -->
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div class="flex min-w-0 flex-wrap items-center gap-2">
            <h1 class="m-0 truncate text-base font-bold text-surface-950-50">{title}</h1>
            {#if badges.length > 0}
                <div class="flex flex-wrap gap-1.5">
                    <!-- Keyed by position, not label: badge text can carry
                         user-supplied names (e.g. a team), which are not unique. -->
                    {#each badges as b, i (i)}
                        <span class="badge {b.preset} gap-1 text-xs">
                            {#if b.icon}
                                <b.icon size={13} aria-hidden="true" />
                            {/if}
                            {b.label}
                        </span>
                    {/each}
                </div>
            {/if}
        </div>
        {#if dates}
            <span class="flex shrink-0 items-center gap-1 text-xs text-primary-700-300">
                <CalendarDays size={13} aria-hidden="true" />
                {dates}
            </span>
        {/if}
    </div>

    <!-- Row 2: the viewer's standing in it. -->
    {#if roleBadges.length > 0}
        <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-xs text-surface-700-300">{roleLabel}</span>
            <div class="flex flex-wrap gap-1.5">
                {#each roleBadges as b, i (i)}
                    <span class="badge {b.preset} gap-1 text-xs">
                        {#if b.icon}
                            <b.icon size={13} aria-hidden="true" />
                        {/if}
                        {b.label}
                    </span>
                {/each}
            </div>
        </div>
    {/if}
</section>
