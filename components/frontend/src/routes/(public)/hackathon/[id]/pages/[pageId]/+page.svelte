<script lang="ts">
    import HeroSection from '$lib/components/hackathon/HeroSection.svelte';
    import PublicHackathonTabs from '$lib/components/hackathon/PublicHackathonTabs.svelte';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import { formatDateRange } from '$lib/utils/hackathonDates';
    import { statusLabel } from '$lib/utils/hackathonStatus';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const hackathon = $derived(data.hackathon);
    const dates = $derived(formatDateRange({ startsAt: hackathon.startsAt, endsAt: hackathon.endsAt }));
</script>

<!--
  A published page, under the same hero and strip as the landing page it was
  reached from.

  The hero names the *hackathon*, not the page, on every route in this subtree —
  so the strip below it always sits in the same place and the reader never has to
  work out which event they are looking at. The page's own title heads its
  content instead, as `h2`, exactly as the member view of the same page does.

  Without the picture, which stays the landing page's. Repeating a logo above
  every FAQ and schedule buys nothing and pushes the content the visitor clicked
  for below the fold. `HeroSection` takes `imageUrl` as optional for this kind of
  reason, so it simply is not passed.
-->
<HeroSection
    title={hackathon.name}
    dates={dates}
    status={statusLabel(hackathon.status)}
    breadcrumbs={[
        { label: 'Hackathons', href: '/' },
        { label: hackathon.name, href: `/hackathon/${hackathon.id}` },
        { label: data.page.title, href: `/hackathon/${hackathon.id}/pages/${data.page.id}` },
    ]}
/>

<PublicHackathonTabs hackathonId={hackathon.id} pages={data.pages} current={data.page.id} />

<div class="mx-auto w-full max-w-7xl">
    <section class="flex flex-col gap-6 px-4 py-12 sm:px-10 md:px-20">
        <h2 class="m-0 text-title text-ink">{data.page.title}</h2>

        {#if data.page.content.trim()}
            <!-- The organisers' own markdown, through the same component the
                 editor previews with, so what they wrote is what shows. -->
            <div class="max-w-3xl">
                <MarkdownContent content={data.page.content} />
            </div>
        {:else}
            <!-- Said plainly rather than papered over: an empty page is the
                 organisers' unfinished work, and pretending otherwise leaves the
                 visitor wondering whether it failed to load. -->
            <p class="m-0 text-sm text-ink-3">This page has no content yet.</p>
        {/if}
    </section>
</div>
