<script lang="ts">
    import { Construction } from 'lucide-svelte';

    /** Page heading shown under the hackathon sub-nav. */
    let {
        title,
    }: {
        title: string;
    } = $props();
</script>

<div class="px-4 py-8 sm:px-10 md:px-20">
    <div
        class="card flex flex-col items-center gap-4 border border-warning/40 bg-warning/10 p-8
               text-center"
    >
        <Construction class="h-10 w-10 text-warning-ink" aria-hidden="true" />
        <div class="flex flex-col gap-1.5">
            <h1 class="m-0 text-title text-ink">{title}</h1>
            <p class="m-0 text-sm text-ink-2">
                This page is under construction. Check back later.
            </p>
        </div>
    </div>
</div>
