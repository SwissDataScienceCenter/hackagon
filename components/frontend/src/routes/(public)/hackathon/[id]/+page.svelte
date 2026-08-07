<script lang="ts">
    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import HeroSection from '$lib/components/hackathon/HeroSection.svelte';
    import OrganizersSection from '$lib/components/hackathon/OrganizersSection.svelte';
    import MarkdownSection from '$lib/components/hackathon/MarkdownSection.svelte';
    import EventsSection from '$lib/components/hackathon/EventsSection.svelte';
    import HighlightsSection from '$lib/components/hackathon/HighlightsSection.svelte';
    import VideoSection from '$lib/components/hackathon/VideoSection.svelte';
    import CtaSection from '$lib/components/hackathon/CtaSection.svelte';

    const organizers = [
        { name: 'SDSC', logoUrl: '/logos/sdsc.svg', logoDarkUrl: '/logos/sdsc_white.svg' },
        { name: 'ETH Zurich', logoUrl: '/images/logos/eth-zurich.svg' },
    ];

    const hackathonTitle = "Open Research Data\nHackathon 2026";
</script>

<HeroSection
    title={hackathonTitle}
    dates="24 – 25 October 2026"
    venue="ETH Zurich, Zurich"
    imageUrl="/images/hackathon-ord-2024/ambiance/ambiance_1.webp"
    status="Registration Open"
    registered={42}
    capacity={100}
    breadcrumbs={[
        { label: 'Hackathons', href: '/' },
        { label: 'ORD Hackathon 2026', href: `/hackathon/${page.params.id}` },
    ]}
/>

<div class="mx-auto w-full max-w-7xl">
<OrganizersSection
    description="Co-organized by the Swiss Data Science Center (SDSC) and ETH Zurich Library, this hackathon brings together researchers, developers, and data stewards to build tools that make research data more accessible and reusable."
    {organizers}
/>

<MarkdownSection content={`
    <h2>About the Hackathon</h2>
    <p>
        The Open Research Data Hackathon is a two-day event focused on building practical tools
        and workflows that advance FAIR (Findable, Accessible, Interoperable, Reusable) data
        practices in Swiss research.
    </p>

    <h3>What to expect</h3>
    <ul>
        <li>Day 1: Keynote talks, team formation, project kickoff, and evening apero</li>
        <li>Day 2: Intensive hacking sessions, project presentations, voting, and awards</li>
    </ul>

    <h3>Who should participate</h3>
    <ul>
        <li>Researchers working with open data</li>
        <li>Software developers interested in research infrastructure</li>
        <li>Data stewards and librarians</li>
        <li>Students in data science, CS, or related fields</li>
    </ul>
`} />

<EventsSection events={[
    {
        title: 'Introduction to FAIR Data Principles',
        speaker: 'Dr. Sarah Mueller, SDSC',
        date: '10 Oct 2026, 14:00 CET',
        linkUrl: '#',
        icon: 'presentation',
    },
    {
        title: 'Technical Setup & Tools Overview',
        speaker: 'Carlos Vivar Rios, SDSC',
        date: '17 Oct 2026, 14:00 CET',
        linkUrl: '#',
        icon: 'wrench',
    },
]} />

<HighlightsSection highlights={[
    {
        message: 'Build tools that make Swiss research data findable and reusable across institutions.',
        imageUrl: '/images/hackathon-ord-2024/ambiance/ambiance_1.webp',
    },
    {
        message: 'Collaborate with researchers, engineers, and data stewards from across Switzerland.',
        imageUrl: '/images/hackathon-ord-2024/teams/teams_1.webp',
    },
    {
        message: 'Win prizes and gain recognition for innovative solutions to real data challenges.',
        imageUrl: '/images/hackathon-ord-2024/winners/winners_1.webp',
    },
]} />

<VideoSection
    title="Highlights from ORD Hackathon 2025"
    videoUrl="https://www.youtube.com/watch?v=ACDgPmRkniU"
    caption="A look back at last year's event and winning projects."
/>

<CtaSection
    heading="Ready to participate?"
    subtitle="42 of 100 spots taken. Free participation, registration mandatory."
    buttonLabel="Register Now"
    buttonHref={resolve(`/my/hackathon/${page.params.id}/overview`)}
    note="Registration closes 17 Oct 2026"
/>
</div>
