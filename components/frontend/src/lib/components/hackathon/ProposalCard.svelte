<script lang="ts">
    let {
        num,
        title,
        description,
        imageUrl,
        moreInfoHref = '#',
    }: {
        num: number;
        title: string;
        description: string;
        imageUrl?: string;
        moreInfoHref?: string;
    } = $props();
</script>

<!--
  Pen: 800× card, padding [16,20,16,20] = 16px vertical / 20px horizontal, gap 16, items-start.
  prc-info: max 500px text col, gap 6. Center card in 960 list: mx-auto.
  More Info: 100×34 — avoid btn-sm extra padding; use inline-flex + fixed box.
-->
<div
    class="box-border mx-auto flex w-full max-w-[800px] items-start
           gap-4 border border-surface-200 bg-surface-50 p-[16px_20px] dark:border-surface-800
           dark:bg-surface-900"
>
    {#if imageUrl}
        <div
            class="relative size-16 shrink-0 overflow-hidden rounded-full border-2 border-surface-200
                   bg-surface-100 dark:border-surface-700 dark:bg-surface-800"
        >
            <img
                src={imageUrl}
                alt=""
                class="absolute inset-0 block h-full w-full object-cover object-center"
            />
        </div>
    {:else}
        <div
            class="size-16 shrink-0 rounded-full border-2 border-surface-200 bg-surface-100
                   dark:border-surface-700 dark:bg-surface-800"
        ></div>
    {/if}

    <div class="flex min-w-0 max-w-[500px] flex-1 flex-col gap-1.5">
        <h3
            class="m-0 text-sm font-semibold leading-[1.3] text-surface-950
                   dark:text-surface-50"
        >
            {num}. {title}
        </h3>
        <p
            class="m-0 text-xs leading-[1.5] text-surface-600
                   dark:text-surface-400"
        >
            {description}
        </p>
    </div>

    <a
        href={moreInfoHref}
        class="inline-flex h-[34px] w-[100px] shrink-0 items-center justify-center
               rounded-none text-xs font-semibold no-underline
               preset-filled-primary-500"
    >
        More Info
    </a>
</div>
