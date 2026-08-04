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

<section class="px-4 py-8 sm:px-10 sm:py-12 md:px-20">
    <div class="mb-6 flex items-center gap-2">
        <Target class="h-5 w-5 text-primary-700-300" />
        <h2 class="text-xl font-bold">{title}</h2>
    </div>

    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
                    <p class="text-sm leading-relaxed text-surface-700-300">{item.message}</p>
                </div>
            </div>
        {/each}
    </div>
</section>
