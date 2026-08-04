<script lang="ts">
    const { data } = $props();
</script>

<div class="p-6">
    <h1 class="text-2xl font-bold mb-4">Teams</h1>
    {#if data.teams.length === 0}
        <p class="text-surface-400">No teams yet.</p>
    {:else}
        <div class="grid gap-4 md:grid-cols-2">
            {#each data.teams as team (team.id)}
                <div class="card p-4 border border-surface-700 rounded-lg">
                    <h2 class="text-lg font-semibold">{team.name}</h2>
                    {#if team.projectTitle}
                        <p class="text-sm text-surface-400">Project: {team.projectTitle}</p>
                    {/if}
                    {#if team.description}
                        <p class="mt-2 text-sm">{team.description}</p>
                    {/if}
                    <ul class="mt-3 flex flex-wrap gap-2">
                        {#each team.members as member (member)}
                            <li class="badge preset-tonal text-sm">{member}</li>
                        {/each}
                    </ul>
                </div>
            {/each}
        </div>
    {/if}
</div>
