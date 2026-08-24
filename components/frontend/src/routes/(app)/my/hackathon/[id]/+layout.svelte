<script lang="ts">
    import { page } from '$app/stores';
    import HeroCompact from '$lib/components/hackathon/HeroCompact.svelte';
    import OrganizerStateAlert from '$lib/components/hackathon/OrganizerStateAlert.svelte';
    import PhaseTimeline from '$lib/components/hackathon/PhaseTimeline.svelte';
    import HackathonSidebar from '$lib/components/layout/HackathonSidebar.svelte';
    import { stateAlerts } from '$lib/utils/hackathonState';

    import type { Snippet } from 'svelte';
    import type { LayoutData } from './$types';
    import { statusLabel, statusBadgeVariant, visibilityLabel, visibilityBadgeVariant } from '$lib/utils/hackathonStatus';
    import { membershipBadgeLabel, membershipBadgeVariant } from '$lib/utils/hackathonRole';
    import { resolvePhaseStatus, sortPhasesByStart } from '$lib/utils/phase';

    let { data, children }: { data: LayoutData; children: Snippet } = $props();

    // The per-hackathon tabs live in HackathonSidebar — see $lib/navigation's
    // memberNav. Two controls listing the same eight destinations was one too many.
    // The sidebar is scoped to this subtree rather than the (app) shell: outside a
    // hackathon it had no hackathon to describe.

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
    // Counted the way the Participants list counts its rows — which drops
    // waitlisted members, for everyone — so the hero and that page never
    // disagree. How many are waiting is the Manage hub's badge, not this number.
    const participantCount = $derived(
        hackathon.members.filter((m) => !m.isWaiting).length,
    );
    // Same resolution the timeline page uses, so the header bar and the page never
    // disagree about which phase is the live one.
    const phases = $derived(
        sortPhasesByStart(hackathon.phases).map((p) => ({
            name: p.name,
            status: resolvePhaseStatus(p, hackathon.state?.currentPhaseId || undefined),
        })),
    );

    const heroBadges = $derived((() => {
        const chips: { label: string; variant: string }[] = [];
        const sl = statusLabel(hackathon.status);
        if (sl) chips.push({ label: sl, variant: statusBadgeVariant(hackathon.status) ?? 'badge-neutral' });
        const vl = visibilityLabel(hackathon.visibility);
        if (vl) chips.push({ label: vl, variant: visibilityBadgeVariant(hackathon.visibility) ?? 'badge-neutral' });
        const mem = data.myMembership;
        if (mem) chips.push({ label: membershipBadgeLabel(mem.isWaiting, mem.role), variant: membershipBadgeVariant(mem.isWaiting) });
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

    // Empty for anyone who cannot fix what it reports, which is what keeps the
    // bar off a participant's screen — they would read a problem they have no
    // control over. Also empty, for everyone, when there is nothing wrong.
    const alerts = $derived(
        data.hackathonState.canManage
            ? stateAlerts({ hasState: data.hackathonState.hasState })
            : [],
    );
</script>

<div class="flex flex-col md:flex-row">
    <HackathonSidebar
        hackathonId={hackathon.id}
        hackathonName={hackathon.name}
        pages={data.hackathonPages}
        membership={data.myMembership}
        isGlobalAdmin={data.isGlobalAdmin}
        votingEnabled={data.votingEnabled}
        resultsVisible={data.resultsVisible}
        teamCount={data.teamCount}
        trackCount={hackathon.tracks.length}
        stateNeedsAttention={alerts.length > 0}
    />

    <!-- min-w-0 so a wide child (a table, a code block) shrinks inside the column
         instead of pushing the sidebar off screen. -->
    <div class="min-w-0 flex-1">
        <!-- Above the hero and outside `showHero`: this follows an organiser
             across every page in the hackathon, because the whole failure mode is
             not knowing to go and look. -->
        <OrganizerStateAlert {alerts} />

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
    </div>
</div>
