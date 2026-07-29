<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { LayoutData } from './$types';

    let { data, children }: { data: LayoutData; children: Snippet } = $props();

    const hackathon = $derived(data.hackathon);
</script>

<div class="border-b border-surface-200-800 bg-surface-50-950 px-4 py-4 sm:px-10 md:px-20">
    <div class="mx-auto flex w-full max-w-7xl items-center gap-3">
        <span class="badge preset-filled-primary-500">Owner</span>
        <h1 class="m-0 text-base font-bold text-surface-950-50">{hackathon.name}</h1>
    </div>
</div>

<div class="mx-auto w-full max-w-7xl">
    {@render children()}
</div>
