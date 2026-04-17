<script lang="ts">
    import { page } from '$app/stores';
    import HackathonSubNav from '$lib/components/hackathon/HackathonSubNav.svelte';
    import HeroCompact from '$lib/components/hackathon/HeroCompact.svelte';
    import PhaseTimeline from '$lib/components/hackathon/PhaseTimeline.svelte';

    import type { Snippet } from 'svelte';
    let { children }: { children: Snippet } = $props();

    const slug = $derived($page.params.slug);

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'participants', label: 'Participants' },
        { id: 'proposals', label: 'Proposals' },
        { id: 'teams', label: 'Teams' },
        { id: 'submissions', label: 'Submissions' },
        { id: 'timeline', label: 'Timeline' },
        { id: 'webinars', label: 'Webinars' },
        { id: 'photos', label: 'Photos' },
    ];

    const phases = [
        { name: 'Registration', status: 'completed' as const },
        { name: 'Proposals', status: 'active' as const },
        { name: 'Teams', status: 'upcoming' as const },
        { name: 'Hackathon', status: 'upcoming' as const },
        { name: 'Voting', status: 'upcoming' as const },
        { name: 'Results', status: 'upcoming' as const },
    ];

    const organizers = [
        { name: 'SDSC', logoUrl: '/logos/sdsc.svg', logoDarkUrl: '/logos/sdsc_white.svg' },
        { name: 'ETH Zurich', logoUrl: '/images/logos/eth-zurich.svg' },
    ];
</script>

<HackathonSubNav {tabs} {slug} />

<HeroCompact
    title="ORD for the Sciences"
    dates="Oct 24 – 25, 2026"
    venue="BC Building, EPFL, Lausanne"
    imageUrl="/images/hackathon-ord-2024/ambiance/ambiance_1.jpg"
    participantCount={100}
    participantCapacity={120}
    {organizers}
/>

<PhaseTimeline {phases} />

{@render children()}
