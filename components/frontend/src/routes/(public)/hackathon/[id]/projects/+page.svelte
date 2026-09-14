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

<HeroSection
    title={hackathon.name}
    {dates}
    status={statusLabel(hackathon.status)}
    breadcrumbs={[
        { label: 'Hackathons', href: '/' },
        { label: hackathon.name, href: `/hackathon/${hackathon.id}` },
        { label: 'Projects', href: `/hackathon/${hackathon.id}/projects` },
    ]}
/>

<PublicHackathonTabs
    hackathonId={hackathon.id}
    pages={hackathon.pages}
    hasProjects={hackathon.projects.length > 0}
    hasTeams={hackathon.teams.length > 0}
    current="projects"
/>

<div class="mx-auto w-full max-w-7xl">
    <section class="flex flex-col gap-6 px-4 py-12 sm:px-10 md:px-20">
        <h2 class="m-0 text-title text-ink">Projects</h2>

        <ul class="m-0 flex list-none flex-col gap-3 p-0">
            {#each data.projects as project (project.id)}
                <li class="card box-border w-full px-5 py-4">
                    <div class="flex min-w-0 flex-col gap-2">
                        <div class="flex flex-wrap items-center gap-2">
                            <h3 class="m-0 text-section text-ink">{project.title}</h3>
                            <!-- A track is a grouping, not a lifecycle state, so
                                 it is neutral rather than one of the status
                                 hues. -->
                            {#if project.trackName}
                                <span class="badge badge-neutral">{project.trackName}</span>
                            {/if}
                        </div>
                        {#if project.description.trim()}
                            <div class="max-w-3xl text-sm text-ink-2">
                                <MarkdownContent content={project.description} />
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    </section>
</div>
