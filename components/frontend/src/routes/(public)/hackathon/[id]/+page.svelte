<script lang="ts">
    import PublicHackathonView from '$lib/components/hackathon/PublicHackathonView.svelte';
    import PublicHackathonTabs from '$lib/components/hackathon/PublicHackathonTabs.svelte';
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
>
    <!-- Passed in rather than built inside the view, so the organiser's preview
         of this same component draws no strip: its links lead out of the editor,
         and the pages they lead to are edited somewhere else entirely. -->
    {#snippet nav()}
        <PublicHackathonTabs hackathonId={hackathon.id} pages={data.pages} current="overview" />
    {/snippet}
</PublicHackathonView>
