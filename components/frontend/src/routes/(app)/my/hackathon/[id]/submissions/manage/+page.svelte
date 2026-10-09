<script lang="ts">
    import { CircleAlert, Download, Search } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import ManageHubBackLink from '$lib/components/hackathon/ManageHubBackLink.svelte';
    import SubmissionStandingTabs from '$lib/components/hackathon/SubmissionStandingTabs.svelte';
    import { nameSegments, type NameSegment } from '$lib/utils/personSearch';
    import { submissionStatusLabel } from '$lib/utils/submissionStatus';
    import type { SubmissionStanding } from '$lib/utils/submissionFilter';
    import { isHttpUrl } from '$lib/utils/url';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    // Derived from the load's return shape rather than restated, so the two
    // can't drift.
    type Row = PageData['rows'][number];
    type Version = NonNullable<Row['latest']>;

    // The badge each standing wears on its row. Draft and final match the
    // submission status badges; nothing filed is neutral, since it is not a
    // status a submission can have — there is no submission.
    const STANDING_BADGE: Record<SubmissionStanding, { label: string; variant: string }> = {
        missing: { label: 'No submission', variant: 'badge-neutral' },
        draft: { label: 'Draft only', variant: 'badge-warning' },
        final: { label: 'Final', variant: 'badge-success' }
    };

    // Narrows the rows of the current tab, unlike the search on Manage Teams,
    // which only marks: there people are being moved and must stay put, here
    // the point is to get to one team out of many.
    let query = $state('');

    const matched = $derived(
        data.rows.map((row) => ({
            row,
            team: nameSegments(row.teamName, query),
            project: nameSegments(row.projectTitle, query),
            member: row.members.some((m) => nameSegments(m, query) !== null)
        }))
    );
    const shown = $derived(
        query.trim() === ''
            ? matched
            : matched.filter((m) => m.team || m.project || m.member)
    );

    function formatDate(d: Date | undefined): string {
        if (!d) return '';
        return d.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    /** The version that counts — the final entry if there is one. */
    function entryOf(row: Row): Version | null {
        return row.latestFinal ?? row.latest;
    }
</script>

{#snippet marked(text: string, segments: NameSegment[] | null)}
    {#if segments}{#each segments as s, i (i)}{#if s.hit}<mark class="bg-accent/25 text-ink"
                    >{s.text}</mark
                >{:else}{s.text}{/if}{/each}{:else}{text}{/if}
{/snippet}

{#snippet resultLine(result: string | undefined)}
    {#if !result}
        <!-- Said outright: `result` is optional on the backend, and a blank
             one would otherwise be indistinguishable from a broken render. -->
        <p class="m-0 text-xs leading-snug text-ink-3 italic">No link or notes.</p>
    {:else if isHttpUrl(result)}
        <!-- eslint-disable svelte/no-navigation-without-resolve -- team-provided external URL -->
        <a
            href={result}
            target="_blank"
            rel="noopener noreferrer"
            class="m-0 block text-xs leading-snug break-all text-accent-ink hover:underline"
        >
            {result}
        </a>
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
    {:else}
        <p class="m-0 text-xs leading-snug break-words text-ink-2">{result}</p>
    {/if}
{/snippet}

{#snippet versionMeta(v: Version)}
    <span class="text-xs text-ink-3">
        Version <span class="tnum">{v.version}</span> · submitted {formatDate(v.createdAt)}{#if v.creator}
            by {v.creator}{/if}{#if v.finalizedAt}
            · finalized {formatDate(v.finalizedAt)}{#if v.finalizedBy} by {v.finalizedBy}{/if}{/if}
    </span>
{/snippet}

<!--
  Every team in the hackathon and where it stands with its submission: nothing
  filed, drafts only, or a final entry. Reached from the sidebar's Manage
  section (see $lib/navigation's manageNav).

  **Read only.** An organiser may read every team's submissions but cannot file
  or finalize one for a team — those are the team's own (see
  `mayViewAllSubmissions`). So every row is information, and chasing a team that
  owes an entry happens outside the app.

  Teams with nothing filed come first, then drafts, then finals, each by name:
  the page is for finding who still owes an entry.

  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches the other manage pages).
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-1">
        <ManageHubBackLink hackathonId={data.hackathonId} />
        <h2 class="m-0 text-title text-ink">Manage Submissions</h2>
    </div>

    <!-- Whether teams can file right now. Shown both ways: "nothing yet" means
         something different when submissions are closed, and an organiser
         reading this list should not have to visit Settings to find out which. -->
    <div
        class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border px-3 py-2
               {data.submissionsOpen
            ? 'border-success/40 bg-success/10'
            : 'border-warning/40 bg-warning/10'}"
        role="status"
    >
        <CircleAlert
            class="h-4 w-4 shrink-0 {data.submissionsOpen ? 'text-success-ink' : 'text-warning-ink'}"
            aria-hidden="true"
        />
        <p class="m-0 text-xs text-ink-2">
            {#if data.submissionsOpen}
                Submissions are open: teams can add new versions and finalize one as their entry.
            {:else}
                Submissions are closed: teams cannot add new versions, but can still finalize a
                draft they already have.
            {/if}
            <a
                href={resolve(`/my/hackathon/${data.hackathonId}/manage`)}
                class="font-semibold text-accent-ink no-underline hover:underline"
            >
                Change under “Submit project work” in Settings
            </a>
        </p>
    </div>

    {#if !data.teamsReadable}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            The teams of this hackathon cannot be read with your account, so there are no
            submissions to show.
        </p>
    {:else}
        <div class="flex flex-wrap items-center justify-between gap-2">
            <SubmissionStandingTabs
                hackathonId={data.hackathonId}
                current={data.filter}
                counts={data.counts}
            />
            <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <label class="relative w-full sm:w-64">
                    <span class="sr-only">Find a team, project or person</span>
                    <Search
                        class="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-ink-3"
                        aria-hidden="true"
                    />
                    <input
                        type="search"
                        bind:value={query}
                        placeholder="Team, project or person"
                        class="field h-8 pr-3 pl-9 text-xs"
                    />
                </label>
                <!-- Every team at every standing, deliberately not the tab or
                     the search you happen to be on — the same choice the
                     project export makes. The Standing column keeps them apart. -->
                <a
                    href={resolve(
                        `/my/hackathon/${data.hackathonId}/submissions/manage/export`
                    )}
                    class="btn btn-sm btn-ghost no-underline"
                    title="Every team, where it stands and its entry"
                    download
                >
                    <Download class="h-3 w-3 shrink-0" aria-hidden="true" />
                    Download CSV
                </a>
            </div>
        </div>

        <div class="flex w-full flex-col items-stretch gap-2">
            {#if data.counts.all === 0}
                <p class="m-0 py-6 text-center text-sm text-ink-3">
                    There are no teams yet, so nobody can submit.
                    <a
                        href={resolve(`/my/hackathon/${data.hackathonId}/teams/manage`)}
                        class="font-semibold text-accent-ink no-underline hover:underline"
                    >
                        Set up teams
                    </a>
                </p>
            {:else if data.rows.length === 0}
                <p class="m-0 py-6 text-center text-sm text-ink-3">
                    {#if data.filter === 'missing'}
                        Every team has submitted something.
                    {:else if data.filter === 'draft'}
                        No team is left with only drafts.
                    {:else}
                        No team has a final entry yet.
                    {/if}
                </p>
            {:else if shown.length === 0}
                <p class="m-0 py-6 text-center text-sm text-ink-3">
                    No team, project or person here matches “{query.trim()}”.
                </p>
            {:else}
                {#each shown as { row, team, project } (row.teamId)}
                    {@const entry = entryOf(row)}
                    {@const badge = STANDING_BADGE[row.standing]}
                    <div class="card card-raised box-border flex w-full flex-col gap-2 px-5 py-4">
                        <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            <div class="flex min-w-0 flex-col gap-0.5">
                                <h3 class="m-0 text-sm leading-snug text-ink">
                                    {@render marked(row.teamName, team)}
                                </h3>
                                <span class="text-xs text-ink-3">
                                    {@render marked(row.projectTitle, project)}
                                </span>
                                <span class="text-xs text-ink-3">
                                    {#if row.members.length > 0}
                                        {#each row.members as m, i (i)}{#if i > 0},
                                            {/if}{@render marked(m, nameSegments(m, query))}{/each}
                                    {:else}
                                        No members
                                    {/if}
                                </span>
                            </div>
                            <span class="badge {badge.variant} shrink-0">{badge.label}</span>
                        </div>

                        {#if entry}
                            <div class="flex flex-col gap-1 border-t border-line pt-2">
                                {@render resultLine(entry.result)}
                                {@render versionMeta(entry)}
                            </div>
                        {/if}

                        {#if row.latest && row.latestFinal && row.latest.id !== row.latestFinal.id}
                            <!-- A draft ahead of the entry. It does not replace the
                                 entry unless the team finalizes it, which is the
                                 thing worth knowing about it. -->
                            <div class="flex flex-col gap-1 border-t border-line pt-2">
                                <span class="text-xs font-semibold text-warning-ink">
                                    Newer draft, not finalized
                                </span>
                                {@render resultLine(row.latest.result)}
                                {@render versionMeta(row.latest)}
                            </div>
                        {/if}

                        {#if row.earlier.length > 0}
                            <details class="border-t border-line pt-2">
                                <summary class="cursor-pointer text-xs text-ink-3">
                                    {row.earlier.length === 1
                                        ? '1 earlier version'
                                        : `${row.earlier.length} earlier versions`}
                                </summary>
                                <div class="mt-2 flex flex-col gap-2">
                                    {#each row.earlier as v (v.id)}
                                        <div class="flex flex-col gap-1">
                                            <span class="text-xs text-ink-2">
                                                {submissionStatusLabel(v.status) ?? 'Unknown'}
                                            </span>
                                            {@render resultLine(v.result)}
                                            {@render versionMeta(v)}
                                        </div>
                                    {/each}
                                </div>
                            </details>
                        {/if}
                    </div>
                {/each}
            {/if}
        </div>
    {/if}
</div>
