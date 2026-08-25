<script lang="ts">
    import HeroSection from '$lib/components/hackathon/HeroSection.svelte';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import { formatDateRange } from '$lib/utils/hackathonDates';
    import { statusLabel } from '$lib/utils/hackathonStatus';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const hackathon = $derived(data.hackathon);
</script>

<HeroSection
    title={hackathon.name}
    dates={formatDateRange(hackathon)}
    status={statusLabel(hackathon.status)}
    breadcrumbs={[
        { label: 'Hackathons', href: '/' },
        { label: hackathon.name, href: `/hackathon/${hackathon.id}` },
    ]}
/>

<div class="mx-auto w-full max-w-7xl">
    <section class="px-4 py-12 sm:px-10 md:px-20">
        {#if hackathon.description}
            <!-- The organizer's own markdown, through the same component the
                 editor previews with, so what they wrote is what shows. -->
            <div class="max-w-3xl">
                <MarkdownContent content={hackathon.description} />
            </div>
        {:else}
            <!-- Said plainly rather than filled with something inviting: this
                 page has one job, and an empty description means the organizer
                 has not done it yet. -->
            <p class="text-sm text-ink-3">
                The organizers have not written a description for this hackathon yet.
            </p>
        {/if}
    </section>
</div>
