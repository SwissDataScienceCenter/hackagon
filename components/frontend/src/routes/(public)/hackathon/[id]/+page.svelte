<script lang="ts">
    import PublicHackathonView from '$lib/components/hackathon/PublicHackathonView.svelte';
    import PublicHackathonTabs from '$lib/components/hackathon/PublicHackathonTabs.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const hackathon = $derived(data.hackathon);
</script>

{#snippet tabs()}
    <PublicHackathonTabs
        hackathonId={hackathon.id}
        pages={hackathon.pages}
        hasProjects={hackathon.projects.length > 0}
        hasTeams={hackathon.teams.length > 0}
        current="overview"
    />
{/snippet}

<!-- The page itself is the component, so the organiser's preview of it cannot
     be showing something else. See PublicHackathonView. -->
<PublicHackathonView
    id={hackathon.id}
    name={hackathon.name}
    description={hackathon.description}
    logo={hackathon.logo}
    startsAt={hackathon.startsAt}
    endsAt={hackathon.endsAt}
    status={hackathon.status}
    signedIn={data.signedIn}
    nav={tabs}
/>
