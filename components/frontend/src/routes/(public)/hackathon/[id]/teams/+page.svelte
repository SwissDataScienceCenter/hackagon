<script lang="ts">
    import HeroSection from '$lib/components/hackathon/HeroSection.svelte';
    import PublicHackathonTabs from '$lib/components/hackathon/PublicHackathonTabs.svelte';
    import { formatDateRange } from '$lib/utils/hackathonDates';
    import { statusLabel } from '$lib/utils/hackathonStatus';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const hackathon = $derived(data.hackathon);
    const dates = $derived(
        formatDateRange({ startsAt: hackathon.startsAt, endsAt: hackathon.endsAt })
    );

    /** A submission result is whatever the team typed; only link it if it is a URL. */
    function asLink(result: string | undefined): string | null {
        if (!result) return null;
        return /^https?:\/\//i.test(result.trim()) ? result.trim() : null;
    }
</script>

<HeroSection
    title={hackathon.name}
    {dates}
    status={statusLabel(hackathon.status)}
    breadcrumbs={[
        { label: 'Hackathons', href: '/' },
        { label: hackathon.name, href: `/hackathon/${hackathon.id}` },
        { label: 'Teams', href: `/hackathon/${hackathon.id}/teams` },
    ]}
/>

<PublicHackathonTabs
    hackathonId={hackathon.id}
    pages={hackathon.pages}
    hasProjects={hackathon.projects.length > 0}
    hasTeams={hackathon.teams.length > 0}
    current="teams"
/>

<div class="mx-auto w-full max-w-7xl">
    <section class="flex flex-col gap-6 px-4 py-12 sm:px-10 md:px-20">
        <h2 class="m-0 text-title text-ink">Teams</h2>

        <ul class="m-0 flex list-none flex-col gap-3 p-0">
            {#each data.teams as team (team.id)}
                <li class="card box-border w-full px-5 py-4">
                    <div class="flex min-w-0 flex-col gap-2">
                        <div class="flex flex-wrap items-center gap-2">
                            <h3 class="m-0 text-section text-ink">{team.name}</h3>
                            <!-- How many, not who. See the loader. -->
                            <span class="badge badge-neutral tnum">
                                {team.memberCount}
                                {team.memberCount === 1 ? 'member' : 'members'}
                            </span>
                        </div>
                        {#if team.projectTitle}
                            <p class="m-0 text-sm text-ink-2">
                                Working on <span class="text-ink">{team.projectTitle}</span>
                            </p>
                        {/if}
                        {#if team.description?.trim()}
                            <p class="m-0 max-w-3xl text-sm text-ink-2">{team.description}</p>
                        {/if}
                        {#each team.submissions as submission (submission.id)}
                            {@const href = asLink(submission.result)}
                            {#if href}
                                <a class="text-sm text-accent-ink" {href} rel="noopener noreferrer">
                                    View submission
                                </a>
                            {:else if submission.result}
                                <p class="m-0 max-w-3xl text-sm text-ink-2">{submission.result}</p>
                            {/if}
                        {/each}
                    </div>
                </li>
            {/each}
        </ul>
    </section>
</div>
