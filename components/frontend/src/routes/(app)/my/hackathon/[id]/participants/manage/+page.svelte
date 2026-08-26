<script lang="ts">
    import { Download, Search } from 'lucide-svelte';
    import { enhance } from '$app/forms';
    import { resolve } from '$app/paths';
    import { SvelteSet } from 'svelte/reactivity';
    import ManageHubBackLink from '$lib/components/hackathon/ManageHubBackLink.svelte';
    import ParticipantCard from '$lib/components/hackathon/ParticipantCard.svelte';
    import ParticipantsManageTabs from '$lib/components/hackathon/ParticipantsManageTabs.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let search = $state('');
    const pendingIds = new SvelteSet<string>();

    // Every action on a row disables that row's whole button group while it is
    // in flight, so the same submit handler serves all three.
    const submitting = (id: string) => () => {
        pendingIds.add(id);
        return async ({ update }: { update: () => Promise<void> }) => {
            await update();
            pendingIds.delete(id);
        };
    };

    // TODO(backend: user-profile-fields): search covers name and role only.
    // Affiliation and skills were the other two axes, and User carries neither,
    // so the placeholder no longer promises them. Widen this back out once the
    // fields land.
    const filtered = $derived(
        data.participants.filter((p) => {
            const q = search.trim().toLowerCase();
            if (q === '') return true;
            return `${p.name} ${p.roleLabel}`.toLowerCase().includes(q);
        })
    );

    // The ratio, with the per-row marker below saying which people make up the
    // gap: it is the list an organizer chases before the event starts.
    const answersLabel = $derived(
        data.questionCount === 0
            ? ''
            : `${data.answeredCount} of ${data.participants.length} answered the registration form`
    );

    const countLabel = $derived(
        filtered.length === 1 ? '1 participant' : `${filtered.length} participants`
    );
</script>

<!--
  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/timeline).

  The organiser's half of Participants: the same confirmed roster the participant
  page lists, and the only place Remove and the owner controls are offered.
  Reached from the sidebar's Manage section (see $lib/navigation's manageNav).

  What a participant answered on the registration form is *not* here. It used to
  be, as a fold-out under every row, which put a hundred collapsed tables on a
  page whose job is approving and removing people. Each row links to that
  participant's page instead, which is where the answers are read — one click
  further, in the one place that also has their teams and their role.
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
            <ManageHubBackLink hackathonId={data.hackathonId} />
            <h2 class="m-0 text-title text-ink">Manage Participants</h2>
            <span class="text-xs text-ink-3">
                {countLabel}{#if data.withoutEmail > 0}
                    &middot; {data.withoutEmail}
                    {data.withoutEmail === 1 ? 'has' : 'have'} no email address{/if}{#if answersLabel !== ''}
                    &middot; {answersLabel}{/if}
            </span>
        </div>
        <div
            class="flex w-full flex-col gap-2 sm:w-auto sm:min-w-0 sm:flex-row sm:items-center
                   sm:justify-end"
        >
            <div class="relative w-full sm:w-72">
                <Search
                    class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5
                           -translate-y-1/2 text-ink-3"
                    aria-hidden="true"
                />
                <input
                    type="search"
                    bind:value={search}
                    placeholder="Search participants by name, role…"
                    class="field pl-9 pr-3"
                />
            </div>
            <!-- The whole roster, deliberately not the searched subset and not
                 this tab's half either: this file goes into a mailing tool, and
                 one whose contents depend on what is typed in the box beside it
                 would be a trap. Waitlisted people are in it, labelled. The
                 endpoint names the download after the hackathon. -->
            <a
                href={resolve(
                    `/my/hackathon/${data.hackathonId}/participants/manage/export`
                )}
                class="btn btn-sm btn-ghost no-underline"
                download
            >
                <Download class="h-3 w-3 shrink-0" aria-hidden="true" />
                Download CSV
            </a>
        </div>
    </div>

    <ParticipantsManageTabs
        hackathonId={data.hackathonId}
        current="roster"
        confirmedCount={data.participants.length}
        waitingCount={data.waitingCount}
    />

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {/if}

    <div class="flex w-full flex-col items-stretch gap-2 self-start">
        {#if data.participants.length === 0}
            <p class="m-0 py-6 text-center text-sm text-ink-3">
                No one has joined this hackathon yet.
            </p>
        {:else if filtered.length === 0}
            <p class="m-0 py-6 text-center text-sm text-ink-3">
                No participants match your search.
            </p>
        {:else}
            {#each filtered as participant (participant.id)}
                <ParticipantCard name={participant.name} role={participant.roleLabel}>
                    {#snippet actions()}
                        <!-- Marked, not counted: the summary above says how many
                             are missing, this says who — and it is quiet, because
                             an unanswered form is a nudge and not a failure.
                             Absent entirely when the hackathon asks nothing. -->
                        {#if data.questionCount > 0 && !participant.answered}
                            <span class="badge badge-neutral">No answers</span>
                        {/if}
                        <!-- Promotion is offered to everyone but an existing
                             owner. Every row here is confirmed, so the old
                             "not waitlisted" half of this condition is gone. -->
                        {#if !participant.isOwner}
                            <form
                                method="POST"
                                action="?/promote"
                                use:enhance={submitting(participant.id)}
                            >
                                <input type="hidden" name="userId" value={participant.id} />
                                <button
                                    type="submit"
                                    disabled={pendingIds.has(participant.id)}
                                    class="btn btn-sm btn-outline"
                                >
                                    Make owner
                                </button>
                            </form>
                        {/if}
                        <!-- Never on your own row: demoting yourself would take
                             away the hackathon:write this page runs on. The
                             backend separately refuses the last owner. -->
                        {#if participant.isOwner && !participant.isMe}
                            <form
                                method="POST"
                                action="?/demote"
                                use:enhance={submitting(participant.id)}
                            >
                                <input type="hidden" name="userId" value={participant.id} />
                                <button
                                    type="submit"
                                    disabled={pendingIds.has(participant.id)}
                                    class="btn btn-sm btn-quiet"
                                >
                                    Remove owner
                                </button>
                            </form>
                        {/if}
                        <!-- The hackathon's owner is deliberately not removable
                             here: RemoveParticipant would leave the hackathon
                             with nobody holding hackathon:write. -->
                        {#if !participant.isOwner}
                            <form
                                method="POST"
                                action="?/remove"
                                use:enhance={submitting(participant.id)}
                            >
                                <input type="hidden" name="userId" value={participant.id} />
                                <button
                                    type="submit"
                                    disabled={pendingIds.has(participant.id)}
                                    class="btn btn-sm btn-danger"
                                >
                                    Remove
                                </button>
                            </form>
                        {/if}
                        <!-- Last in the group and quiet, because it is the one
                             control that does not change anything: the way to
                             what this row used to unfold, plus their teams and
                             their join date. Same link the participant list
                             offers, so both halves lead to one profile. -->
                        <a
                            href={resolve(
                                `/my/hackathon/${data.hackathonId}/participants/${participant.id}`
                            )}
                            class="btn btn-sm btn-ghost no-underline"
                        >
                            View
                        </a>
                    {/snippet}
                </ParticipantCard>
            {/each}
        {/if}
    </div>
</div>
