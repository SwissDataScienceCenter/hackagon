<script lang="ts">
    let {
        results,
        empty = 'No placements published yet.',
    }: {
        results: {
            id: string;
            position: number;
            title: string;
            submissionLabel: string;
        }[];
        empty?: string;
    } = $props();

    const ordered = $derived([...results].sort((a, b) => a.position - b.position));
</script>

{#if ordered.length === 0}
    <p class="text-sm text-surface-500">{empty}</p>
{:else}
    <ol class="flex flex-col gap-2">
        {#each ordered as r (r.id)}
            <li class="flex items-start gap-3">
                <span class="badge preset-tonal-primary shrink-0">#{r.position}</span>
                <span class="min-w-0">
                    <span class="block break-words text-sm font-medium">{r.submissionLabel}</span>
                    {#if r.title}
                        <span class="block text-xs text-surface-500">{r.title}</span>
                    {/if}
                </span>
            </li>
        {/each}
    </ol>
{/if}
