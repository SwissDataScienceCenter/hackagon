<script lang="ts">
    import { CircleAlert, Clock, Download, Search, Users, UsersRound } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import ManageHubBackLink from '$lib/components/hackathon/ManageHubBackLink.svelte';
    import RoundMedia from '$lib/components/hackathon/RoundMedia.svelte';
    import SubmissionStandingTabs from '$lib/components/hackathon/SubmissionStandingTabs.svelte';
    import { nameSegments, type NameSegment } from '$lib/utils/personSearch';
    import { avatarInitials } from '$lib/utils/initials';
    import {
        DEFAULT_SUBMISSION_FILTER,
        SUBMISSION_FILTER_LABEL,
        SUBMISSION_STANDINGS,
        inSubmissionFilter,
        submissionFilterCounts,
        submissionFilterFrom,
        submissionFilterQuery,
        type SubmissionStanding
    } from '$lib/utils/submissionFilter';
    import { isHttpUrl } from '$lib/utils/url';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    // Derived from the load's return shape rather than restated, so the two
    // can't drift.
    type Row = PageData['rows'][number];

    // The badge each standing wears on its row. Nothing filed is neutral, since
    // it is not a status a submission can have — there is no submission.
    const STANDING_BADGE: Record<SubmissionStanding, { label: string; variant: string }> = {
        missing: { label: 'No submission', variant: 'badge-neutral' },
        submitted: { label: 'Submitted', variant: 'badge-success' }
    };

    // The tab, read here rather than in the load: the load returns every team
    // and never looks at `?standing=`, so switching tabs re-runs nothing on the
    // server — see the load. An absent or unknown value lands on All.
    const filter = $derived(
        submissionFilterFrom(page.url.searchParams.get('standing')) ??
            DEFAULT_SUBMISSION_FILTER
    );

    // Narrows the rows of the current tab, unlike the search on Manage Teams,
    // which only marks: there people are being moved and must stay put, here
    // the point is to get to one team out of many.
    //
    // It survives a tab change: the tabs are links to this same route, and
    // SvelteKit keeps the component mounted across them.
    let query = $state('');
    const searching = $derived(query.trim() !== '');

    const matched = $derived(
        data.rows.map((row) => ({
            row,
            team: nameSegments(row.teamName, query),
            project: nameSegments(row.projectTitle, query),
            member: row.members.some((m) => nameSegments(m, query) !== null)
        }))
    );
    // Every team the search finds, on any tab — what the tab counts are taken
    // from while searching, so they say where the matches are instead of
    // switching tabs under the organiser as they type.
    const hits = $derived(
        searching ? matched.filter((m) => m.team || m.project || m.member) : matched
    );
    const counts = $derived(submissionFilterCounts(hits.map((m) => m.row.standing)));
    const shown = $derived(hits.filter((m) => inSubmissionFilter(m.row.standing, filter)));

    // The other tabs holding matches, for the empty state to point at.
    const elsewhere = $derived(
        SUBMISSION_STANDINGS.filter((s) => s !== filter && counts[s] > 0)
    );

    // Date only, as on the Submissions list: the row is scanned, and the
    // entry's own page has the time.
    function formatDate(d: Date | undefined): string {
        if (!d) return '';
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }
</script>

{#snippet marked(text: string, segments: NameSegment[] | null)}
    {#if segments}{#each segments as s, i (i)}{#if s.hit}<mark class="bg-accent/25 text-ink"
                    >{s.text}</mark
                >{:else}{s.text}{/if}{/each}{:else}{text}{/if}
{/snippet}

{#snippet preview(row: Row)}
    <!-- Two lines and no more, as on the Submissions list: the load already cut
         the text, and the clamp is what holds on a narrow screen. A link only
         when there is no description, so an entry that is nothing but a link
         still says something on its row. -->
    {#if row.excerpt}
        <p class="prose m-0 line-clamp-2 max-w-[52ch] text-xs leading-snug text-ink-2">
            {row.excerpt}
        </p>
    {:else if row.link}
        <p class="m-0 truncate text-xs leading-snug">
            {#if isHttpUrl(row.link)}
                <!-- eslint-disable svelte/no-navigation-without-resolve -- team-provided external URL -->
                <a
                    href={row.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-accent-ink hover:underline"
                >
                    {row.link}
                </a>
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
            {:else}
                <!-- Notes typed into the link field before it had to be one. -->
                <span class="text-ink-2">{row.link}</span>
            {/if}
        </p>
    {/if}
{/snippet}

<!--
  Every team in the hackathon and whether it has submitted. A team holding only
  drafts has not — the same rule as the ballot. Reached from the sidebar's Manage
  section (see $lib/navigation's manageNav).

  **Read only.** An organiser may read every team's submission but cannot save
  one for a team — that is the team's own (see
  `mayViewAllSubmissions`). So every row is information, and chasing a team that
  owes an entry happens outside the app.

  Teams with nothing filed come first, then the rest, each by name: the page is
  for finding who still owes an entry. Each row is the entry in brief; View
  opens the team's own submission page, which has all of it.

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
                Submissions are open: teams can save and change their submission.
            {:else}
                Submissions are closed: teams can no longer change their submission.
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
            <div class="flex flex-col gap-1">
                <SubmissionStandingTabs
                    hackathonId={data.hackathonId}
                    current={filter}
                    {counts}
                />
                <!-- Said, because the same numbers mean something else a moment
                     earlier: without it a tab dropping to 0 reads as teams gone. -->
                {#if searching}
                    <span class="text-xs text-ink-3">
                        Counting teams that match “{query.trim()}”.
                    </span>
                {/if}
            </div>
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
            {#if data.rows.length === 0}
                <p class="m-0 py-6 text-center text-sm text-ink-3">
                    There are no teams yet, so nobody can submit.
                    <a
                        href={resolve(`/my/hackathon/${data.hackathonId}/teams/manage`)}
                        class="font-semibold text-accent-ink no-underline hover:underline"
                    >
                        Set up teams
                    </a>
                </p>
            {:else if shown.length === 0 && searching}
                <!-- Points at the tabs holding matches rather than switching to
                     one: the search runs on every keystroke, and a match can be
                     on more than one tab. Following a link keeps the search. -->
                <p class="m-0 py-6 text-center text-sm text-ink-3">
                    {#if elsewhere.length === 0}
                        No team, project or person matches “{query.trim()}”.
                    {:else}
                        Nothing on {SUBMISSION_FILTER_LABEL[filter]} matches “{query.trim()}” —
                        {#each elsewhere as s, i (s)}{#if i > 0},
                            {/if}<a
                                href="{resolve(
                                    `/my/hackathon/${data.hackathonId}/submissions/manage`
                                )}{submissionFilterQuery(s)}"
                                class="font-semibold text-accent-ink no-underline hover:underline"
                                ><span class="tnum">{counts[s]}</span> on {SUBMISSION_FILTER_LABEL[
                                    s
                                ]}</a
                            >{/each}.
                    {/if}
                </p>
            {:else if shown.length === 0}
                <p class="m-0 py-6 text-center text-sm text-ink-3">
                    {#if filter === 'missing'}
                        Every team has submitted.
                    {:else}
                        No team has submitted yet.
                    {/if}
                </p>
            {:else}
                {#each shown as { row, team, project } (row.teamId)}
                    {@const badge = STANDING_BADGE[row.standing]}
                    <!-- The Submissions list's row — media | text | controls —
                         with what an organiser chases by: the members, and the
                         standing as a badge. -->
                    <div class="card card-raised box-border flex w-full items-start gap-4 px-5 py-4">
                        <RoundMedia src={row.imageUrl} initials={avatarInitials(row.projectTitle)} />

                        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                            <h3 class="m-0 text-sm leading-snug text-ink">
                                {@render marked(row.projectTitle, project)}
                            </h3>
                            {@render preview(row)}
                            <div
                                class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3"
                            >
                                <span class="inline-flex items-center gap-1.5">
                                    <UsersRound class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    {@render marked(row.teamName, team)}
                                </span>
                                <span class="inline-flex items-center gap-1.5">
                                    <Users class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    {#if row.members.length > 0}
                                        <span>
                                            {#each row.members as m, i (i)}{#if i > 0},
                                                {/if}{@render marked(
                                                    m,
                                                    nameSegments(m, query)
                                                )}{/each}
                                        </span>
                                    {:else}
                                        No members
                                    {/if}
                                </span>
                                <span class="inline-flex items-center gap-1.5">
                                    <Clock class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    {#if row.updatedAt}
                                        Updated {formatDate(row.updatedAt)}{#if row.updatedBy}
                                            by {row.updatedBy}{/if}
                                    {:else}
                                        Not submitted yet
                                    {/if}
                                </span>
                            </div>
                        </div>

                        <div class="flex shrink-0 flex-col items-end gap-2">
                            <span class="badge {badge.variant}">{badge.label}</span>
                            {#if row.standing === 'submitted'}
                                <a
                                    href={resolve(
                                        `/my/hackathon/${data.hackathonId}/submissions/${row.teamId}`
                                    )}
                                    class="btn btn-sm btn-ghost no-underline"
                                >
                                    View
                                </a>
                            {/if}
                        </div>
                    </div>
                {/each}
            {/if}
        </div>
    {/if}
</div>
