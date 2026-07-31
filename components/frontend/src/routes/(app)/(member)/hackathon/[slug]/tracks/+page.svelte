<script lang="ts">
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    const tracks = $derived(data.tracks);
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <h2 class="m-0 text-lg font-bold text-surface-950-50">Tracks</h2>
        <span class="text-xs text-surface-500">{tracks.length} tracks</span>
    </div>

    {#if tracks.length === 0}
        <p class="m-0 text-sm text-surface-500">No tracks have been set for this hackathon yet.</p>
    {:else}
        <div class="flex flex-col gap-4">
            {#each tracks as t (t.id)}
                <div class="card preset-outlined-surface-200-800 flex flex-col gap-2 p-5">
                    <h3 class="m-0 text-base font-bold text-surface-950-50">{t.name}</h3>
                    {#if t.description}
                        <div class="text-sm leading-relaxed text-surface-700-300">
                            <MarkdownContent content={t.description} />
                        </div>
                    {:else}
                        <p class="m-0 text-xs text-surface-500">No description provided.</p>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>
