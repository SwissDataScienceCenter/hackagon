<script lang="ts">
    import HeroSection from '$lib/components/hackathon/HeroSection.svelte';
    import PublicHackathonTabs from '$lib/components/hackathon/PublicHackathonTabs.svelte';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import { formatDateRange } from '$lib/utils/hackathonDates';
    import { statusLabel } from '$lib/utils/hackathonStatus';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const hackathon = $derived(data.hackathon);
    const dates = $derived(
        formatDateRange({ startsAt: hackathon.startsAt, endsAt: hackathon.endsAt })
    );
</script>

<!--
  The hero names the *hackathon*, not the page, so the strip below it sits in the
  same place it does on the overview and a visitor arriving from a shared link
  knows what they are looking at. The page's own title heads its content, which
  is how the member view draws a page too.

  No picture here: repeating the hackathon's logo above every information page
  makes the page about the logo. It stays the overview's.
-->
<HeroSection
    title={hackathon.name}
    {dates}
    status={statusLabel(hackathon.status)}
    breadcrumbs={[
        { label: 'Hackathons', href: '/' },
        { label: hackathon.name, href: `/hackathon/${hackathon.id}` },
        { label: data.page.title, href: `/hackathon/${hackathon.id}/pages/${data.page.id}` },
    ]}
/>

<PublicHackathonTabs
    hackathonId={hackathon.id}
    pages={hackathon.pages}
    hasProjects={hackathon.projects.length > 0}
    hasTeams={hackathon.teams.length > 0}
    current={data.page.id}
/>

<div class="mx-auto w-full max-w-7xl">
    <section class="flex flex-col gap-6 px-4 py-12 sm:px-10 md:px-20">
        <h2 class="m-0 text-title text-ink">{data.page.title}</h2>
        {#if data.page.content.trim()}
            <div class="max-w-3xl">
                <MarkdownContent content={data.page.content} />
            </div>
        {:else}
            <p class="m-0 text-sm text-ink-3">This page has no content yet.</p>
        {/if}
    </section>
</div>
