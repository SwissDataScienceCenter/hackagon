<script lang="ts">
    import { page } from '$app/stores';
    import HeroCompact from '$lib/components/hackathon/HeroCompact.svelte';
    import PhaseTimeline from '$lib/components/hackathon/PhaseTimeline.svelte';

    import type { Snippet } from 'svelte';
    import type { LayoutData } from './$types';
    import { statusLabel, statusBadgePreset, visibilityLabel, visibilityBadgePreset, membershipBadgeLabel, membershipBadgePreset } from '$lib/utils/hackathonStatus';
    import { resolvePhaseStatus, sortPhasesByStart } from '$lib/utils/phase';

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

    const hackathon = $derived(data.hackathon);
    const title = $derived(hackathon.name);
    const dates = $derived(formatDates(hackathon.startsAt, hackathon.endsAt));
    const participantCount = $derived(hackathon.members.length);
    // Same resolution the timeline page uses, so the header bar and the page never
    // disagree about which phase is the live one.
    const phases = $derived(
        sortPhasesByStart(hackathon.phases).map((p) => ({
            name: p.name,
            status: resolvePhaseStatus(p, hackathon.state?.currentPhaseId || undefined),
        })),
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

    // The hero and phase bar belong to the overview and nowhere else: every other
    // member page carries its own heading, and repeating the hackathon's identity
    // above it just pushes the content down.
    //
    // Keyed on the route id rather than the last path segment, which cannot
    // express a route whose final segment is a parameter — /pages/[pageId] ends in
    // a uuid, so a segment blocklist silently let the hero back in there.
    const showHero = $derived($page.route.id?.endsWith('/overview') ?? false);
</script>

{#if showHero}
    <!--
      TODO(backend: hackathon-venue-capacity): `venue` stays empty and
      `participantCapacity` unset — Hackathon carries neither field. The hero
      then shows the member count with no denominator and no location line.
      Nothing to change here once the fields land beyond passing them through.
    -->
    <HeroCompact
        {title}
        {dates}
        venue=""
        imageUrl={hackathon.logo}
        {participantCount}
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
