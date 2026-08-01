<script lang="ts">
    import HackathonHeader from '$lib/components/hackathon/HackathonHeader.svelte';

    import type { Snippet } from 'svelte';
    import type { LayoutData } from './$types';

    let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<HackathonHeader hackathon={data.hackathon} myMembership={data.myMembership} />

<div class="mx-auto w-full max-w-7xl">
    {@render children()}
</div>
