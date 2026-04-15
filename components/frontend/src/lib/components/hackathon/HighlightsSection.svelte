<script lang="ts">
    import { Target } from 'lucide-svelte';

    let {
        title = 'Goals',
        highlights,
    }: {
        title?: string;
        highlights: { message: string; imageUrl?: string; gradient?: string }[];
    } = $props();
</script>

<section class="border-t border-surface-200 px-20 py-12 dark:border-surface-800">
    <div class="mb-6 flex items-center gap-2">
        <Target class="h-5 w-5 text-primary-700 dark:text-primary-500" />
        <h2 class="text-xl font-bold">{title}</h2>
    </div>

    <div class="grid grid-cols-3 gap-5">
        {#each highlights as item, i (i)}
            <div class="card preset-outlined-surface-200-800 overflow-hidden">
                {#if item.imageUrl}
                    <img src={item.imageUrl} alt="" class="h-40 w-full object-cover" />
                {:else}
                    <div
                        class="h-40 w-full"
                        style="background: {item.gradient ?? `linear-gradient(150deg, var(--color-primary-700), var(--color-primary-950))`}"
                    ></div>
                {/if}
                <div class="p-5">
                    <p class="text-sm leading-relaxed text-surface-700 dark:text-surface-100">{item.message}</p>
                </div>
            </div>
        {/each}
    </div>
</section>
