<script lang="ts">
    const { data } = $props();
</script>

<div class="p-6">
    <h1 class="text-2xl font-bold mb-4">Submissions</h1>
    {#if data.submissions.length === 0}
        <p class="text-surface-400">No submissions yet.</p>
    {:else}
        <div class="grid gap-4 md:grid-cols-2">
            {#each data.submissions as submission (submission.id)}
                <div class="card p-4 border border-surface-700 rounded-lg">
                    <div class="flex items-center justify-between gap-2">
                        <h2 class="text-lg font-semibold">{submission.projectTitle}</h2>
                        <span class="badge preset-tonal text-sm">{submission.status}</span>
                    </div>
                    <p class="text-sm text-surface-400">{submission.teamName}</p>
                    {#if submission.result}
                        <p class="mt-2 text-sm text-surface-300">{submission.result}</p>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>
