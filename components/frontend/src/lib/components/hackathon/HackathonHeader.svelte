<script lang="ts">
    import HeroSlim from '$lib/components/hackathon/HeroSlim.svelte';
    import type { HeroBadge } from '$lib/components/hackathon/HeroSlim.svelte';
    import CalendarClock from 'lucide-svelte/icons/calendar-clock';
    import Zap from 'lucide-svelte/icons/zap';
    import CircleCheck from 'lucide-svelte/icons/circle-check';
    import Globe from 'lucide-svelte/icons/globe';
    import Lock from 'lucide-svelte/icons/lock';
    import Crown from 'lucide-svelte/icons/crown';
    import User from 'lucide-svelte/icons/user';
    import Hourglass from 'lucide-svelte/icons/hourglass';
    import UsersRound from 'lucide-svelte/icons/users-round';
    import {
        statusLabel,
        statusBadgePreset,
        visibilityLabel,
        visibilityBadgePreset,
        membershipBadgeLabel,
        membershipBadgePreset,
    } from '$lib/utils/hackathonStatus';

    /** The one header every hackathon page wears — member and owner shells alike.
     *  Both layouts render this so the chips and dates cannot drift apart. */
    let {
        hackathon,
        myMembership = null,
        myTeams = [],
    }: {
        hackathon: {
            name: string;
            startsAt?: Date;
            endsAt?: Date;
            status: number;
            visibility: number;
        };
        myMembership?: { isWaiting: boolean; role: number } | null;
        myTeams?: { id: string; name: string }[];
    } = $props();

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

    const dates = $derived(formatDates(hackathon.startsAt, hackathon.endsAt));

    // HackathonStatus: PENDING=1, ACTIVE=2, FINISHED=3
    const STATUS_ICON = { 1: CalendarClock, 2: Zap, 3: CircleCheck };
    // Visibility: PUBLIC=1, PRIVATE=2
    const VISIBILITY_ICON = { 1: Globe, 2: Lock };

    /** Row 1 — what the hackathon is. */
    const badges = $derived((() => {
        const chips: HeroBadge[] = [];
        const sl = statusLabel(hackathon.status);
        if (sl)
            chips.push({
                label: sl,
                preset: statusBadgePreset(hackathon.status) ?? 'preset-tonal-surface',
                icon: STATUS_ICON[hackathon.status as keyof typeof STATUS_ICON],
            });
        const vl = visibilityLabel(hackathon.visibility);
        if (vl)
            chips.push({
                label: vl,
                preset: visibilityBadgePreset(hackathon.visibility) ?? 'preset-tonal-surface',
                icon: VISIBILITY_ICON[hackathon.visibility as keyof typeof VISIBILITY_ICON],
            });
        return chips;
    })());

    /** Row 2 — where the viewer stands in it. */
    const roleBadges = $derived((() => {
        const chips: HeroBadge[] = [];
        if (myMembership) {
            chips.push({
                label: membershipBadgeLabel(myMembership.isWaiting, myMembership.role),
                preset: membershipBadgePreset(myMembership.isWaiting),
                icon: myMembership.isWaiting
                    ? Hourglass
                    : myMembership.role === 1
                      ? Crown
                      : User,
            });
        }
        // The viewer's team(s), so "which team am I on" is answered from any
        // page. Names are user-supplied, hence no keying on them.
        for (const t of myTeams) {
            chips.push({ label: t.name, preset: 'preset-tonal-secondary', icon: UsersRound });
        }
        return chips;
    })());
</script>

<HeroSlim title={hackathon.name} {dates} {badges} {roleBadges} />
