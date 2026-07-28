<script lang="ts">
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const hackathon = $derived(data.hackathon);
    const pendingCount = $derived(hackathon.members.filter((m) => m.isWaiting).length);
    const approvedCount = $derived(hackathon.members.filter((m) => !m.isWaiting).length);

    const stats = $derived([
        { label: 'Approved participants', value: approvedCount },
        { label: 'Pending approval', value: pendingCount },
        { label: 'Pages', value: hackathon.pages.length },
        { label: 'Phases', value: hackathon.phases.length },
        { label: 'Tracks', value: hackathon.tracks.length },
        { label: 'Projects', value: hackathon.projects.length },
    ]);
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <p class="m-0 text-sm text-surface-500">
        Managing participants, pages, phases and tracks from here is coming soon.
    </p>

    <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {#each stats as stat (stat.label)}
            <div class="card preset-outlined-surface-200-800 flex flex-col gap-1 p-4">
                <span class="text-2xl font-bold">{stat.value}</span>
                <span class="text-xs text-surface-500">{stat.label}</span>
            </div>
        {/each}
    </div>
</div>
