<script lang="ts">
    const { data } = $props();

    function range(startsAt: Date | string | null, endsAt: Date | string | null): string {
        if (!startsAt) return '';
        const fmt = (d: Date | string) => new Date(d).toLocaleDateString();
        return endsAt ? `${fmt(startsAt)} – ${fmt(endsAt)}` : fmt(startsAt);
    }
</script>

<div class="p-6">
    <h1 class="text-2xl font-bold mb-4">Timeline</h1>
    {#if data.phases.length === 0}
        <p class="text-surface-400">No phases scheduled yet.</p>
    {:else}
        <ol class="space-y-4">
            {#each data.phases as phase (phase.id)}
                <li class="card p-4 border border-surface-700 rounded-lg">
                    <div class="flex items-center justify-between gap-2">
                        <h2 class="text-lg font-semibold">{phase.name}</h2>
                        <span class="text-sm text-surface-400">{range(phase.startsAt, phase.endsAt)}</span>
                    </div>
                    {#if phase.description}
                        <p class="mt-2 text-sm text-surface-300">{phase.description}</p>
                    {/if}
                </li>
            {/each}
        </ol>
    {/if}
</div>
