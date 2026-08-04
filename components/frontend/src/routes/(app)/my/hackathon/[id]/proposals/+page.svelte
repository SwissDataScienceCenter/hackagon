<script lang="ts">
    const { data } = $props();
</script>

<div class="p-6">
    <h1 class="text-2xl font-bold mb-4">Proposals</h1>
    {#if data.proposals.length === 0}
        <p class="text-surface-400">No proposals yet.</p>
    {:else}
        <div class="grid gap-4 md:grid-cols-2">
            {#each data.proposals as proposal (proposal.id)}
                <div class="card p-4 border border-surface-700 rounded-lg">
                    <div class="flex items-center justify-between gap-2">
                        <h2 class="text-lg font-semibold">{proposal.title}</h2>
                        <span class="badge preset-tonal text-sm">{proposal.status}</span>
                    </div>
                    {#if proposal.description}
                        <p class="mt-2 text-sm text-surface-300">{proposal.description}</p>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>
