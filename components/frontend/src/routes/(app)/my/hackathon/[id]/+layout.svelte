<script lang="ts">
    import { page } from '$app/stores';
    import HeroCompact from '$lib/components/hackathon/HeroCompact.svelte';
    import PhaseTimeline from '$lib/components/hackathon/PhaseTimeline.svelte';

    import type { Snippet } from 'svelte';
    import type { LayoutData } from './$types';
    import { statusLabel, statusBadgePreset, visibilityLabel, visibilityBadgePreset, membershipBadgeLabel, membershipBadgePreset } from '$lib/utils/hackathonStatus';

    let { data, children }: { data: LayoutData; children: Snippet } = $props();

    // The per-hackathon tabs moved into AppSidebar — see $lib/navigation's
    // memberNav. Two controls listing the same eight destinations was one too
    // many, and the sidebar is the one that survives leaving the hackathon.

    function formatDates(startsAt: Date | undefined, endsAt: Date | undefined): string {
        if (!startsAt) return '';
        const fmt = (d: Date) =>
            d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        if (!endsAt) return fmt(startsAt);
        if (
            startsAt.getFullYear() === endsAt.getFullYear() &&
            startsAt.getMonth() === endsAt.getMonth()
        ) {
            const month = startsAt.toLocaleDateString('en-US', { month: 'short' });
            return `${month} ${startsAt.getDate()} – ${endsAt.getDate()}, ${startsAt.getFullYear()}`;
        }
        return `${fmt(startsAt)} – ${fmt(endsAt)}`;
    }

    function phaseStatus(
        startsAt: Date | undefined,
        endsAt: Date | undefined,
    ): 'completed' | 'active' | 'upcoming' {
        const now = new Date();
        if (endsAt && endsAt < now) return 'completed';
        if (startsAt && startsAt <= now) return 'active';
        return 'upcoming';
    }

    const hackathon = $derived(data.hackathon);
    const title = $derived(hackathon.name);
    const dates = $derived(formatDates(hackathon.startsAt, hackathon.endsAt));
    const participantCount = $derived(hackathon.members.length);
    const phases = $derived(
        hackathon.phases.map((p) => ({ name: p.name, status: phaseStatus(p.startsAt, p.endsAt) })),
    );

    const heroBadges = $derived((() => {
        const chips: { label: string; preset: string }[] = [];
        const sl = statusLabel(hackathon.status);
        if (sl) chips.push({ label: sl, preset: statusBadgePreset(hackathon.status) ?? 'preset-tonal-surface' });
        const vl = visibilityLabel(hackathon.visibility);
        if (vl) chips.push({ label: vl, preset: visibilityBadgePreset(hackathon.visibility) ?? 'preset-tonal-surface' });
        const mem = data.myMembership;
        if (mem) chips.push({ label: membershipBadgeLabel(mem.isWaiting, mem.role), preset: membershipBadgePreset(mem.isWaiting) });
        return chips;
    })());

    /** List pages: content only (no compact hero or phase bar). */
    const listPageSegments = new Set([
        'participants',
        'teams',
        'proposals',
        'submissions',
        'timeline',
        'webinars',
        'photos',
    ]);
    const hideHeroAndTimeline = $derived(
        listPageSegments.has($page.url.pathname.split('/').filter(Boolean).pop() ?? '')
    );
</script>

{#if !hideHeroAndTimeline}
    <HeroCompact
        {title}
        {dates}
        venue=""
        imageUrl={hackathon.logo}
        {participantCount}
        participantCapacity={participantCount}
        organizers={[]}
        badges={heroBadges}
    />

    {#if phases.length > 0}
        <PhaseTimeline {phases} />
    {/if}
{/if}

<div class="mx-auto w-full max-w-7xl">
    {@render children()}
</div>
