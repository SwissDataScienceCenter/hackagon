<script lang="ts">
    import { page } from '$app/stores';
    import HackathonSubNav from '$lib/components/hackathon/HackathonSubNav.svelte';
    import HeroCompact from '$lib/components/hackathon/HeroCompact.svelte';
    import PhaseTimeline from '$lib/components/hackathon/PhaseTimeline.svelte';

    import type { Snippet } from 'svelte';
    import type { LayoutData } from './$types';
    import { statusLabel, statusBadgePreset, visibilityLabel, visibilityBadgePreset, membershipBadgeLabel, membershipBadgePreset } from '$lib/utils/hackathonStatus';

    let { data, children }: { data: LayoutData; children: Snippet } = $props();

    const hackathonId = $derived($page.params.id);

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'participants', label: 'Participants' },
        { id: 'proposals', label: 'Proposals' },
        { id: 'teams', label: 'Teams' },
        { id: 'submissions', label: 'Submissions' },
        { id: 'timeline', label: 'Timeline' },
        { id: 'voting', label: 'Voting' },
        { id: 'webinars', label: 'Webinars' },
        { id: 'photos', label: 'Photos' },
    ];

    // Organizers get the management cockpit. The tab is hidden for plain
    // members — the backend denies them anyway, so this only avoids showing a
    // door that will not open. HackathonRole: UNSPECIFIED=0, OWNER=1, MEMBER=2.
    const canManage = $derived(data.myMembership?.role === 1);
    const visibleTabs = $derived(
        canManage ? [...tabs, { id: 'manage', label: 'Manage' }] : tabs,
    );

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

    /** List pages: only sub-nav + content (no compact hero or phase bar). */
    const listPageSegments = new Set([
        'participants',
        'teams',
        'proposals',
        'submissions',
        'timeline',
        'webinars',
        'photos',
        'manage',
        'voting',
    ]);
    const hideHeroAndTimeline = $derived(
        listPageSegments.has($page.url.pathname.split('/').filter(Boolean).pop() ?? '')
    );
</script>

<div class="mx-auto w-full max-w-7xl">
    <HackathonSubNav tabs={visibleTabs} hackathonId={hackathonId ?? ''} />
</div>

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
