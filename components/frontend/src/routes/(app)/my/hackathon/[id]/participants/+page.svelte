<script lang="ts">
    import { Search } from 'lucide-svelte';
    import ParticipantCard from '$lib/components/hackathon/ParticipantCard.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    let search = $state('');

    // TODO(backend: user-profile-fields): affiliation is matched against
    // placeholder copy from $lib/mocks/userProfiles, so it only finds the seeded
    // users. Skills are not a field — they live in the profile description, which
    // this list does not carry — so the placeholder still does not promise them.
    const filtered = $derived(
        data.participants.filter((p) => {
            const q = search.trim().toLowerCase();
            if (q === '') return true;
            return `${p.name} ${p.roleLabel} ${p.affiliation ?? ''}`
                .toLowerCase()
                .includes(q);
        })
    );

    const countLabel = $derived(
        filtered.length === 1 ? '1 participant' : `${filtered.length} participants`
    );
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
            <h2 class="m-0 text-lg font-bold text-surface-950-50">All Participants</h2>
            <span class="text-xs text-surface-500">{countLabel}</span>
        </div>
        <div
            class="flex w-full flex-col gap-2 sm:w-auto sm:min-w-0 sm:flex-row sm:items-center
                   sm:justify-end"
        >
            <div class="relative w-full sm:w-72">
                <Search
                    class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5
                           -translate-y-1/2 text-surface-400"
                    aria-hidden="true"
                />
                <input
                    type="search"
                    bind:value={search}
                    placeholder="Search participants by name, role…"
                    class="h-9 w-full rounded-none border border-surface-200-800 bg-surface-50-950
                           pl-9 pr-3 text-xs text-surface-950-50 placeholder:text-surface-700-300
                           focus:border-primary-500 focus:outline-none"
                />
            </div>
        </div>
    </div>

    <div class="flex w-full flex-col items-stretch gap-2 self-start">
        {#if data.participants.length === 0}
            <p class="m-0 py-6 text-center text-sm text-surface-500">
                No one has joined this hackathon yet.
            </p>
        {:else if filtered.length === 0}
            <p class="m-0 py-6 text-center text-sm text-surface-500">
                No participants match your search.
            </p>
        {:else}
            {#each filtered as participant (participant.id)}
                <ParticipantCard
                    name={participant.name}
                    role={participant.roleLabel}
                    affiliation={participant.affiliation}
                    profileDetailsHref={data.canViewProfiles
                        ? `/people/${participant.id}`
                        : `#participant-${participant.id}`}
                />
            {/each}
        {/if}
    </div>
</div>
