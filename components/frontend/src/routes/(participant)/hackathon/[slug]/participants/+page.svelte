<script lang="ts">
    import { Search } from 'lucide-svelte';
    import ParticipantRow from '$lib/components/hackathon/ParticipantRow.svelte';

    const participants = [
        { name: 'Anna Müller', affiliation: 'ETH Zurich', skills: ['Python', 'ML', 'NLP'], registeredAt: 'Sep 12' },
        { name: 'Carlos Vivar Rios', affiliation: 'SDSC', skills: ['Go', 'Kubernetes', 'Data Eng'], registeredAt: 'Sep 10' },
        { name: 'Sophie Dupont', affiliation: 'EPFL', skills: ['R', 'Statistics'], registeredAt: 'Sep 15' },
        { name: 'Luca Bernasconi', affiliation: 'Univ. of Bern', skills: ['Python', 'Computer Vision', 'PyTorch'], registeredAt: 'Sep 18' },
        { name: 'Elena Rossi', affiliation: 'ETH Zurich', skills: ['JavaScript', 'React', 'Data Viz'], registeredAt: 'Sep 20' },
        { name: 'Marc Hofmann', affiliation: 'Univ. of Zurich', skills: ['Rust', 'Systems'], registeredAt: 'Sep 22' },
        { name: 'Julia Fischer', affiliation: 'EPFL', skills: ['Bioinformatics', 'Python', 'R', 'Genomics'], registeredAt: 'Sep 23' },
        { name: 'Thomas Weber', affiliation: 'SDSC', skills: ['Scala', 'Spark', 'Data Eng'], registeredAt: 'Sep 25' },
        { name: 'Nadia Keller', affiliation: 'ETH Zurich', skills: ['ML', 'Transformers'], registeredAt: 'Sep 28' },
        { name: 'David Schmid', affiliation: 'Univ. of Bern', skills: ['Python', 'Climate Data'], registeredAt: 'Oct 1' },
        { name: 'Marie Favre', affiliation: 'EPFL', skills: ['Signal Processing', 'MATLAB'], registeredAt: 'Oct 3' },
        { name: 'Patrick Meier', affiliation: 'Univ. of Zurich', skills: ['NLP', 'Python', 'LLMs'], registeredAt: 'Oct 5' },
    ];

    let search = $state('');

    const filtered = $derived(
        participants.filter((p) =>
            `${p.name} ${p.affiliation} ${p.skills.join(' ')}`
                .toLowerCase()
                .includes(search.toLowerCase())
        )
    );
</script>

<div class="flex flex-col gap-6 px-20 py-8">
    <div class="flex items-center justify-between">
        <div class="flex flex-col gap-1">
            <h2 class="text-lg font-bold">Participants</h2>
            <span class="text-xs text-surface-500">{participants.length} registered</span>
        </div>

        <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
            <input
                type="text"
                placeholder="Search by name, affiliation, or skill…"
                bind:value={search}
                class="h-9 w-72 rounded-sm border border-surface-200 bg-surface-50 pl-9 pr-3 text-xs
                       placeholder:text-surface-400
                       focus:border-primary-500 focus:outline-none
                       dark:border-surface-700 dark:bg-surface-900"
            />
        </div>
    </div>

    <div class="card preset-outlined-surface-200-800 overflow-hidden">
        <div class="flex h-9 items-center gap-4 border-b border-surface-200 px-4 dark:border-surface-800">
            <span class="w-8 shrink-0"></span>
            <span class="flex-1 text-xs font-semibold text-surface-500">Name</span>
            <span class="w-52 text-xs font-semibold text-surface-500">Skills</span>
            <span class="w-16 text-right text-xs font-semibold text-surface-500">Joined</span>
        </div>

        {#if filtered.length === 0}
            <div class="flex h-20 items-center justify-center text-sm text-surface-500">
                No participants match your search.
            </div>
        {:else}
            <div class="divide-y divide-surface-200 dark:divide-surface-800">
                {#each filtered as participant (participant.name)}
                    <ParticipantRow
                        name={participant.name}
                        affiliation={participant.affiliation}
                        skills={participant.skills}
                        registeredAt={participant.registeredAt}
                    />
                {/each}
            </div>
        {/if}
    </div>
</div>
