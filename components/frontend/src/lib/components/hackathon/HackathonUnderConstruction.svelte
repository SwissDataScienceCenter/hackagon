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
        class="card flex flex-col items-center gap-4 border border-warning-500/40 bg-warning-500/5 p-8
               text-center dark:bg-warning-950/20"
    >
        <Construction class="h-10 w-10 text-warning-600-400" aria-hidden="true" />
        <div class="flex flex-col gap-1.5">
            <h1 class="m-0 text-lg font-bold text-surface-950-50">{title}</h1>
            <p class="m-0 text-sm text-surface-600-400">
                This page is under construction. Check back later.
            </p>
        </div>
    </div>
</div>
