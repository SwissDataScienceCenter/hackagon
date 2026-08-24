<script lang="ts">
    import { Download, Search } from 'lucide-svelte';
    import { enhance } from '$app/forms';
    import { resolve } from '$app/paths';
    import { SvelteSet } from 'svelte/reactivity';
    import ManageHubBackLink from '$lib/components/hackathon/ManageHubBackLink.svelte';
    import ParticipantCard from '$lib/components/hackathon/ParticipantCard.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let search = $state('');
    const pendingIds = new SvelteSet<string>();

    // Every action on a row disables that row's whole button group while it is
    // in flight, so the same submit handler serves all four.
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

    const countLabel = $derived(
        filtered.length === 1 ? '1 participant' : `${filtered.length} participants`
    );

    const waitingCount = $derived(data.participants.filter((p) => p.isWaiting).length);
</script>

<!--
  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/timeline).

  The organiser's half of Participants: the list reads the same as the
  participant page, and this is the only place Approve and Remove are offered.
  Reached from the sidebar's Manage section (see $lib/navigation's manageNav).
-->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
            <ManageHubBackLink hackathonId={data.hackathonId} />
            <h2 class="m-0 text-title text-ink">Manage Participants</h2>
            <span class="text-xs text-ink-3">
                {countLabel}{#if waitingCount > 0}
                    &middot; {waitingCount} awaiting approval{/if}{#if data.withoutEmail > 0}
                    &middot; {data.withoutEmail}
                    {data.withoutEmail === 1 ? 'has' : 'have'} no email address{/if}
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
            <!-- The whole roster, deliberately not the searched subset: this
                 file goes into a mailing tool, and one whose contents depend on
                 what is typed in the box beside it would be a trap. The
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
                        {#if participant.isWaiting}
                            <form
                                method="POST"
                                action="?/approve"
                                use:enhance={submitting(participant.id)}
                            >
                                <input type="hidden" name="userId" value={participant.id} />
                                <button
                                    type="submit"
                                    disabled={pendingIds.has(participant.id)}
                                    class="btn btn-sm btn-accent"
                                >
                                    Approve
                                </button>
                            </form>
                        {/if}
                        <!-- Promotion is offered to approved members only: an
                             owner who is still waitlisted would be a
                             contradiction the badge can't express. -->
                        {#if !participant.isWaiting && !participant.isOwner}
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
                        {#if !participant.isWaiting && !participant.isOwner}
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
                    {/snippet}
                </ParticipantCard>
            {/each}
        {/if}
    </div>
</div>
