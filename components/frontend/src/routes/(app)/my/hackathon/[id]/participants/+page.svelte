<script lang="ts">
    import { Search } from 'lucide-svelte';
    import ParticipantCard from '$lib/components/hackathon/ParticipantCard.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    let search = $state('');

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
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
            <h2 class="m-0 text-lg font-bold text-ink">All Participants</h2>
            <span class="text-xs text-ink-3">{countLabel}</span>
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
        </div>
    </div>

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
                <ParticipantCard
                    name={participant.name}
                    role={participant.roleLabel}
                    profileDetailsHref="#participant-{participant.id}"
                />
            {/each}
        {/if}
    </div>
</div>
