<script lang="ts">
    import PublicHackathonView from '$lib/components/hackathon/PublicHackathonView.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const hackathon = $derived(data.hackathon);
</script>

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
/>
