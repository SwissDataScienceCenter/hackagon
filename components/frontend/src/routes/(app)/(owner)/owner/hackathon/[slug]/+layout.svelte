<script lang="ts">
    import { resolve } from '$app/paths';
    import type { Snippet } from 'svelte';
    import type { LayoutData } from './$types';

    let { data, children }: { data: LayoutData; children: Snippet } = $props();

    const hackathon = $derived(data.hackathon);
</script>

<div class="border-b border-surface-200-800 bg-surface-50-950 px-4 py-4 sm:px-10 md:px-20">
    <div class="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
        <div class="flex items-center gap-3">
            <span class="badge preset-filled-primary-500">Owner</span>
            <h1 class="m-0 text-base font-bold text-surface-950-50">{hackathon.name}</h1>
        </div>
        <a
            href={resolve(`/hackathon/${hackathon.id}/overview`)}
            class="btn btn-sm preset-tonal-primary no-underline shrink-0"
        >
            View as participant
        </a>
    </div>
</div>

<div class="mx-auto w-full max-w-7xl">
    {@render children()}
</div>
