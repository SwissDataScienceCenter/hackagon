<script lang="ts">
    import { resolve } from '$app/paths';
    import InfoButton from '$lib/components/layout/InfoButton.svelte';
    import SubmissionDetail from '$lib/components/hackathon/SubmissionDetail.svelte';
    import SubmissionForm from '$lib/components/hackathon/SubmissionForm.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Derived from the load's return shape rather than restated, so the two
    // can't drift.
    type Group = PageData['groups'][number];

    /**
     * Whether a team's form is open: Edit's `?edit=<teamId>`, or a save of it
     * that failed. The second holds without JavaScript too, where the failed
     * form comes back on the action's URL with `?edit=` gone — and what was
     * typed is still in it. Never while submitting is closed.
     */
    function editing(g: Group): boolean {
        if (!data.maySubmit) return false;
        return data.editTeamId === g.teamId || form?.teamId === g.teamId;
    }
</script>

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/projects). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <!-- A label rather than a heading: each team's project title below is the
         heading, as on the submission's own page, so this reads the same. -->
    <div class="flex min-w-0 items-center gap-2">
        <span class="meta">Our submission</span>
        <InfoButton topic="submission-mine" title="Your team's submission" />
    </div>

    <!-- A failure that never reached a team (a malformed form) has no card to
         sit in, so it is reported here rather than swallowed. -->
    {#if form?.message && !form?.teamId}
        <p
            class="m-0 rounded-card border border-danger/40 bg-danger/10 px-3 py-2 text-xs
                   text-danger-ink"
            role="alert"
        >
            {form.message}
        </p>
    {/if}

    <!-- Ahead of the empty state, because the two say opposite things about the
         same blank page: "not on a team" is a fact about the reader, and this is
         an admission that we have not been told. Submissions hang off a team, so
         with assignments unpublished there is nothing to hang them on — see the
         TODO in the load. -->
    {#if !data.teamsPublished}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            Team assignments have not been published for this hackathon yet, so there is
            nothing here to submit against. This opens with "See team assignments" in the
            hackathon's settings.
        </p>
    {:else if data.groups.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            You are not on a team yet, so there is nothing to submit.
        </p>
    {:else}
        {#each data.groups as g, i (g.teamId)}
            <!-- A hairline between teams, for the rare participant on more than
                 one: each block has its own heading and would otherwise run on
                 into the next. -->
            <section class="flex flex-col gap-4 {i > 0 ? 'border-t border-line pt-6' : ''}">
                {#if editing(g)}
                    <!-- The read view's heading, kept so the reader stays oriented;
                         Cancel in Edit's place goes back to it. A link, so the
                         form's guard asks before unsaved changes are lost. -->
                    <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                        <div class="flex min-w-0 flex-col gap-1">
                            <h2 class="m-0 text-title text-ink">{g.projectTitle}</h2>
                            <span class="text-xs text-ink-3">{g.teamName}</span>
                        </div>
                        <a
                            href={resolve(`/my/hackathon/${data.hackathonId}/submissions/mine`)}
                            class="btn btn-sm btn-ghost no-underline"
                        >
                            Cancel
                        </a>
                    </div>
                    <SubmissionForm
                        teamId={g.teamId}
                        projectId={g.projectId}
                        saved={g.entry}
                        message={form?.teamId === g.teamId ? form?.message : undefined}
                    />
                {:else}
                    {#snippet edit()}
                        <!-- First submission is the one thing to do on a team that
                             has none, so it takes the page's solid accent; Edit
                             on an entry that exists is quieter. -->
                        <a
                            href="{resolve(
                                `/my/hackathon/${data.hackathonId}/submissions/mine`
                            )}?edit={g.teamId}"
                            class="btn btn-sm no-underline {g.entry
                                ? 'btn-outline-accent'
                                : 'btn-solid'}"
                        >
                            {g.entry ? 'Edit' : 'Make your first submission'}
                        </a>
                    {/snippet}

                    {#if data.savedTeamId === g.teamId}
                        <p class="m-0 text-xs text-success-ink" role="status">
                            Saved. This is your team's entry now.
                        </p>
                    {:else if data.unchangedTeamId === g.teamId}
                        <p class="m-0 text-xs text-ink-3" role="status">
                            Nothing changed, so nothing was saved.
                        </p>
                    {/if}

                    <SubmissionDetail
                        projectTitle={g.projectTitle}
                        teamName={g.teamName}
                        entry={g.entry}
                        team={{
                            href: `/my/hackathon/${data.hackathonId}/teams/${g.teamId}`,
                            imageUrl: g.imageUrl,
                            members: g.members.map((m) => ({
                                name: m.name,
                                href: resolve(
                                    `/my/hackathon/${data.hackathonId}/participants/${m.id}`
                                ),
                            })),
                        }}
                        project={g.project
                            ? {
                                  ...g.project,
                                  href: `/my/hackathon/${data.hackathonId}/projects/${g.project.id}`,
                              }
                            : undefined}
                        actions={data.maySubmit ? edit : undefined}
                    />
                {/if}
            </section>
        {/each}
    {/if}
</div>
