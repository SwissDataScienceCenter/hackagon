<script lang="ts">
    import { Search } from 'lucide-svelte';
    import ParticipantCard from '$lib/components/hackathon/ParticipantCard.svelte';

    interface DemoParticipant {
        name: string;
        affiliation: string;
        skills: string[];
        role?: string;
        linkedinUrl?: string;
    }

    const participants: DemoParticipant[] = [
        {
            name: 'Carlos Vivar Rios',
            role: 'Senior Data Scientist',
            affiliation: 'SDSC',
            skills: ['Go', 'Kubernetes', 'Data Eng'],
            linkedinUrl: 'https://www.linkedin.com/',
        },
        { name: 'Anna Müller', role: 'PhD Researcher', affiliation: 'ETH Zurich', skills: ['Python', 'ML', 'NLP'] },
        { name: 'Sophie Dupont', affiliation: 'EPFL', skills: ['R', 'Statistics'] },
        { name: 'Luca Bernasconi', affiliation: 'Univ. of Bern', skills: ['Python', 'Computer Vision', 'PyTorch'] },
        {
            name: 'Elena Rossi',
            affiliation: 'ETH Zurich',
            skills: ['JavaScript', 'React', 'Data Viz'],
            linkedinUrl: 'https://www.linkedin.com/',
        },
        { name: 'Marc Hofmann', affiliation: 'Univ. of Zurich', skills: ['Rust', 'Systems'] },
        { name: 'Julia Fischer', affiliation: 'EPFL', skills: ['Bioinformatics', 'Python', 'R', 'Genomics'] },
        { name: 'Thomas Weber', affiliation: 'SDSC', skills: ['Scala', 'Spark', 'Data Eng'] },
        { name: 'Nadia Keller', affiliation: 'ETH Zurich', skills: ['ML', 'Transformers'] },
        { name: 'David Schmid', affiliation: 'Univ. of Bern', skills: ['Python', 'Climate Data'] },
        { name: 'Marie Favre', affiliation: 'EPFL', skills: ['Signal Processing', 'MATLAB'] },
        { name: 'Patrick Meier', affiliation: 'Univ. of Zurich', skills: ['NLP', 'Python', 'LLMs'] },
    ];

    let search = $state('');

    const filtered = $derived(
        participants.filter((p) => {
            const q = search.trim().toLowerCase();
            if (q === '') return true;
            const roleStr = p.role ?? p.skills.join(' ');
            return `${p.name} ${p.affiliation} ${roleStr} ${p.skills.join(' ')}`
                .toLowerCase()
                .includes(q);
        })
    );

    const countLabel = $derived(
        filtered.length === 1 ? '1 registered' : `${filtered.length} registered`
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
                    placeholder="Search participants by name, affiliation…"
                    class="h-9 w-full rounded-none border border-surface-200-800 bg-surface-50-950
                           pl-9 pr-3 text-xs text-surface-950-50 placeholder:text-surface-700-300
                           focus:border-primary-500 focus:outline-none"
                />
            </div>
        </div>
    </div>

    <div class="flex w-full flex-col items-stretch gap-2 self-start">
        {#if filtered.length === 0}
            <p class="m-0 py-6 text-center text-sm text-surface-500">
                No participants match your search.
            </p>
        {:else}
            {#each filtered as participant (participant.name)}
                <ParticipantCard
                    name={participant.name}
                    affiliation={participant.affiliation}
                    role={participant.role}
                    skills={participant.skills}
                    linkedinUrl={participant.linkedinUrl}
                    profileDetailsHref="#participant-{encodeURIComponent(participant.name)}"
                />
            {/each}
        {/if}
    </div>
</div>
