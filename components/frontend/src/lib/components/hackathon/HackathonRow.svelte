<script lang="ts">
    // Pathname, not string: resolve() is typed against the route tree, and a
    // bare string is not assignable to it. Every caller passes an absolute path
    // it built itself, which `/${string}` covers.
    import type { Pathname } from '$app/types';
    import { resolve } from '$app/paths';
    import { Users } from 'lucide-svelte';

    let {
        href,
        name,
        org,
        meta,
        badge,
        badgeVariant = 'badge-accent',
        count,
        gradFrom,
        gradTo,
        size = 'default',
    }: {
        href: Pathname;
        name: string;
        org?: string;
        meta: string;
        badge?: string;
        badgeVariant?: string;
        count?: string;
        gradFrom: string;
        gradTo: string;
        size?: 'default' | 'compact';
    } = $props();

    const thumbSize = size === 'compact' ? 'h-9 w-9' : 'h-12 w-12';
    // A floor rather than a fixed height: with `org` set the row carries three
    // stacked lines, which a fixed height would clip.
    const rowHeight = size === 'compact' ? 'min-h-14' : 'min-h-[72px]';
</script>

<a
    href={resolve(href)}
    class="flex {rowHeight} items-center gap-4 px-4 no-underline transition-colors hover:bg-raised"
>
    <div
        class="{thumbSize} shrink-0 rounded-field"
        style="background: linear-gradient(135deg, {gradFrom}, {gradTo})"
    ></div>
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <!-- The organisation is an eyebrow above the name rather than sharing a
             line behind a slash, so the hackathon's own name gets the line to
             itself and every row's title starts on the same left edge. -->
        {#if org}
            <span class="meta truncate">{org}</span>
        {/if}
        <span class="truncate text-sm font-semibold text-ink">{name}</span>
        <span class="tnum text-xs text-ink-3">{meta}</span>
    </div>
    {#if badge}
        <span class="badge {badgeVariant} shrink-0">
            {badge}
        </span>
    {/if}
    {#if count}
        <!-- Tabular so the counts line up down the column rather than wandering. -->
        <div class="flex shrink-0 items-center gap-1 text-ink-3">
            <Users class="h-3 w-3" aria-hidden="true" />
            <span class="tnum text-xs">{count}</span>
        </div>
    {/if}
</a>
