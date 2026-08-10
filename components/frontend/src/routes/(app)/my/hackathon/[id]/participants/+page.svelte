<script lang="ts">
    import { enhance } from '$app/forms';
    import { SvelteSet } from 'svelte/reactivity';
    import ParticipantCard from '$lib/components/hackathon/ParticipantCard.svelte';
    import DataToolbar from '$lib/components/data/DataToolbar.svelte';
    import type { FilterDef, ViewMode } from '$lib/utils/dataView';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let search = $state('');
    let view = $state<ViewMode>('cards');
    let filterValues = $state<Record<string, string>>({});
    const pendingIds = new SvelteSet<string>();

    // Confirmed and waitlisted are ONE list with a status filter, not two
    // sections: an organiser working the waitlist wants to narrow to it, and a
    // participant reading the roster wants everyone. Two lists could not be
    // sorted or searched as one.
    const FILTERS: FilterDef[] = [
        {
            id: 'status',
            label: 'Status',
            options: [
                { value: 'confirmed', label: 'Confirmed' },
                { value: 'waitlisted', label: 'Waitlisted' },
            ],
        },
    ];

    // TODO(backend: user-profile-fields): search covers name and role only.
    // Affiliation and skills were the other two axes, and User carries neither,
    // so the placeholder no longer promises them. Widen this back out once the
    // fields land.
    const filtered = $derived(
        data.participants.filter((p) => {
            const status = filterValues.status;
            if (status === 'confirmed' && p.isWaiting) return false;
            if (status === 'waitlisted' && !p.isWaiting) return false;

            const q = search.trim().toLowerCase();
            if (q === '') return true;
            return `${p.name} ${p.roleLabel}`.toLowerCase().includes(q);
        })
    );

    const confirmedCount = $derived(
        data.participants.filter((p) => !p.isWaiting).length
    );

    // Capacity counts CONFIRMED participants only; 0 means uncapped. The three
    // derived numbers below drive the fullness notices: how many places are
    // free, and by how much the organiser has (deliberately) overshot.
    const capacity = $derived(data.maxParticipants ?? 0);
    const waitingCount = $derived(data.participants.length - confirmedCount);
    const freePlaces = $derived(
        capacity > 0 ? Math.max(0, capacity - confirmedCount) : 0
    );
    const overBy = $derived(
        capacity > 0 ? Math.max(0, confirmedCount - capacity) : 0
    );

    const countLabel = $derived(
        filtered.length === 1 ? '1 participant' : `${filtered.length} participants`
    );

    type Participant = PageData['participants'][number];

    // The backend is the authority on all four of these; the point of asking
    // here is only to not offer a button whose answer is already known to be no.
    // Demote is the interesting one: you may not demote yourself (you would be
    // giving up the permission needed to undo it) and not the last organizer.
    function mayPromote(p: Participant): boolean {
        return data.mayManage && !p.isWaiting && !p.isOwner;
    }
    function mayDemote(p: Participant): boolean {
        return data.mayManage && p.isOwner && !p.isSelf && data.ownerCount > 1;
    }
</script>

<!-- One definition for both views. The table and the cards used to carry their
     own copies of the same two forms, which is how the cards ended up without
     the controls the table had. -->
{#snippet action(participant: Participant, verb: string, label: string, cls: string)}
    <form
        method="POST"
        action="?/{verb}"
        use:enhance={() => {
            pendingIds.add(participant.id);
            return async ({ update }) => {
                await update();
                pendingIds.delete(participant.id);
            };
        }}
    >
        <input type="hidden" name="userId" value={participant.id} />
        <button
            type="submit"
            disabled={pendingIds.has(participant.id)}
            class="btn btn-sm {cls}"
        >
            {label}
        </button>
    </form>
{/snippet}

{#snippet rowActions(participant: Participant)}
    {#if data.mayManage && participant.isWaiting}
        {@render action(participant, 'approve', 'Approve', 'btn-accent')}
    {/if}
    {#if mayPromote(participant)}
        {@render action(participant, 'promote', 'Make organizer', '')}
    {/if}
    {#if mayDemote(participant)}
        {@render action(participant, 'demote', 'Step down', '')}
    {/if}
    {#if data.mayManage && !participant.isWaiting && !participant.isOwner}
        {@render action(participant, 'remove', 'Remove', 'btn-danger')}
    {/if}
{/snippet}

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    {#if form?.message}
        <!-- The refusals these actions can hit (last organizer, not yet
             approved) are explanations, not glitches, and were previously
             swallowed by use:enhance with nothing shown at all. -->
        <p class="alert alert-warning m-0" role="status">{form.message}</p>
    {/if}

    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
            <h2 class="m-0 text-title text-ink">All Participants</h2>
            <span class="text-xs text-ink-3">{countLabel}</span>
        </div>
    </div>

    <!-- The shared toolbar, as on the other management lists: search, a status
         filter, and a cards/table toggle remembered per list. -->
    <DataToolbar
        bind:search
        bind:view
        bind:filterValues
        viewKey="participants"
        filters={FILTERS}
        placeholder="Search participants by name, role…"
        summary="{confirmedCount} confirmed of {data.participants.length}{capacity > 0
            ? ` · capacity ${capacity}`
            : ''}"
        shown={filtered.length}
        total={data.participants.length}
    />

    <!-- How full the room is, when the event has a capacity. Three states, one
         visible at a time; approving past the cap is ALLOWED, so the full and
         over states exist to make the overshoot a decision, not an accident.
         The free-places state is the manual-promotion contract: a freed place
         is never handed out automatically, so it must be impossible to miss. -->
    {#if capacity > 0}
        {#if overBy > 0}
            <p
                class="m-0 rounded-card border border-line bg-raised px-4 py-3 text-sm
                       text-warning-ink"
                role="status"
            >
                Over capacity: {confirmedCount} confirmed of {capacity}
                {capacity === 1 ? 'place' : 'places'}.
            </p>
        {:else if freePlaces === 0 && data.mayManage && waitingCount > 0}
            <p
                class="m-0 rounded-card border border-line bg-raised px-4 py-3 text-sm
                       text-warning-ink"
                role="status"
            >
                This event is full ({confirmedCount} of {capacity} confirmed).
                Approving more people will go over capacity.
            </p>
        {:else if freePlaces > 0 && data.mayManage && waitingCount > 0}
            <p
                class="m-0 rounded-card border border-line bg-raised px-4 py-3 text-sm
                       text-ink-2"
                role="status"
            >
                {freePlaces}
                {freePlaces === 1 ? 'place' : 'places'} free — {waitingCount}
                {waitingCount === 1 ? 'person is' : 'people are'} waiting. Nobody
                is promoted automatically: approve from the waiting list to hand
                a place out.
            </p>
        {/if}
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
        {:else if view === 'table'}
            <!-- One table, status as a column — not two tables split by state,
                 which would sort each half separately and sort nothing overall. -->
            <div class="w-full overflow-x-auto rounded-card border border-line">
                <table class="w-full min-w-[560px] border-collapse text-left text-xs">
                    <caption class="sr-only">Participants</caption>
                    <thead>
                        <tr class="border-b border-line bg-raised text-ink-3">
                            <th class="px-3 py-2 font-semibold">Name</th>
                            <th class="px-3 py-2 font-semibold">Role</th>
                            <th class="px-3 py-2 font-semibold">Status</th>
                            {#if data.mayManage}
                                <th class="px-3 py-2 font-semibold">Actions</th>
                            {/if}
                        </tr>
                    </thead>
                    <tbody>
                        {#each filtered as participant (participant.id)}
                            <tr class="border-b border-line last:border-0">
                                <td class="px-3 py-2 font-medium text-ink">{participant.name}</td>
                                <td class="px-3 py-2 text-ink-2">{participant.roleLabel}</td>
                                <td class="px-3 py-2">
                                    <span
                                        class="badge {participant.isWaiting
                                            ? 'badge-warning'
                                            : 'badge-success'}"
                                    >
                                        {participant.isWaiting ? 'Waitlisted' : 'Confirmed'}
                                    </span>
                                </td>
                                {#if data.mayManage}
                                    <td class="px-3 py-2">
                                        <div class="flex flex-wrap gap-1">
                                            {@render rowActions(participant)}
                                        </div>
                                    </td>
                                {/if}
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {:else}
            {#each filtered as participant (participant.id)}
                <ParticipantCard
                    name={participant.name}
                    role={participant.roleLabel}
                    profileDetailsHref="#participant-{participant.id}"
                >
                    {#snippet actions()}
                        {@render rowActions(participant)}
                    {/snippet}
                </ParticipantCard>
            {/each}
        {/if}
    </div>
</div>
