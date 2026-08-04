<script lang="ts">
    import { resolve } from '$app/paths';

    let {
        num,
        title,
        description,
        creator,
        imageUrl,
        moreInfoHref = '#',
        moreInfoLabel = 'More Info',
        badge,
        badgePreset = 'preset-tonal-surface',
        meta,
    }: {
        num: number;
        title: string;
        description: string;
        /** Who proposed it. Omitted when the creator is no longer a member. */
        creator?: string;
        imageUrl?: string;
        moreInfoHref?: string;
        /** CTA text. The card is a row first and a "More Info" link second. */
        moreInfoLabel?: string;
        /** Generic chip text — kept a plain string so the card is not tied to
         *  any one vocabulary. My Projects passes a status, others may not. */
        badge?: string;
        badgePreset?: string;
        /** Extra line under the description, e.g. the track. */
        meta?: string;
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
        <div class="flex flex-wrap items-center gap-2">
            <h3 class="m-0 text-sm font-bold leading-snug text-surface-950-50">
                {num}. {title}
            </h3>
            {#if badge}
                <span class="badge {badgePreset} shrink-0 rounded-none text-[0.625rem] font-semibold uppercase">
                    {badge}
                </span>
            {/if}
        </div>
        <div class="block w-2/3 min-w-0">
            <p class="m-0 text-xs leading-snug text-surface-600-400">
                {description}
            </p>
        </div>
        {#if creator}
            <p class="m-0 text-xs leading-snug text-surface-500">
                Proposed by {creator}
            </p>
        {/if}
        {#if meta}
            <p class="m-0 text-xs leading-snug text-surface-500">{meta}</p>
        {/if}
    </div>

    <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic path from page data; resolve() is route-literal typed -->
    <a href={resolve(moreInfoHref as any)} class="btn btn-sm preset-tonal-surface">
        {moreInfoLabel}
    </a>
</div>
