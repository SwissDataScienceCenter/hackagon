<script lang="ts">
    import { resolve } from '$app/paths';

    let {
        num,
        title,
        description,
        creator,
        imageUrl,
        moreInfoHref = '#',
    }: {
        num: number;
        title: string;
        description: string;
        /** Who proposed it. Omitted when the creator is no longer a member. */
        creator?: string;
        imageUrl?: string;
        moreInfoHref?: string;
    } = $props();
</script>

<!-- Matches TeamCard: py-4 px-5, row gap-4, size-16 media, gap-1.5, title/ body scale, CTA. -->
<div
    class="box-border flex w-full items-start gap-4 border border-surface-200-800
           bg-surface-100-900 py-4 px-5"
>
    {#if imageUrl}
        <div
            class="relative size-16 shrink-0 overflow-hidden rounded-full border-2
                   border-surface-200-800 bg-surface-100-900"
        >
            <img
                src={imageUrl}
                alt=""
                class="absolute inset-0 block h-full w-full object-cover object-center"
            />
        </div>
    {:else}
        <div
            class="size-16 shrink-0 rounded-full border-2 border-surface-200-800 bg-surface-100-900"
        ></div>
    {/if}

    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 class="m-0 text-sm font-bold leading-snug text-surface-950-50">
            {num}. {title}
        </h3>
        <div class="block w-full min-w-0 sm:w-2/3">
            <p class="m-0 text-xs leading-snug text-surface-600-400">
                {description}
            </p>
        </div>
        {#if creator}
            <p class="m-0 text-xs leading-snug text-surface-500">
                Proposed by {creator}
            </p>
        {/if}
    </div>

    <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic path from page data; resolve() is route-literal typed -->
    <a href={resolve(moreInfoHref as any)} class="btn btn-sm preset-tonal-surface">
        More Info
    </a>
</div>
