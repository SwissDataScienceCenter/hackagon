<script lang="ts">
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
        href: string;
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
    const rowHeight = size === 'compact' ? 'h-14' : 'h-[72px]';
</script>

<a
    href={resolve(href)}
    class="flex {rowHeight} items-center gap-4 px-4 no-underline transition-colors hover:bg-raised"
>
    <div
        class="{thumbSize} shrink-0"
        style="background: linear-gradient(135deg, {gradFrom}, {gradTo})"
    ></div>
    <div class="flex flex-1 flex-col gap-0.5">
        <div class="flex items-center gap-2">
            {#if org}
                <span class="text-sm text-ink-3">{org}</span>
                <span class="text-sm text-ink-3">/</span>
            {/if}
            <span class="text-sm font-semibold">{name}</span>
        </div>
        <span class="text-xs text-ink-3">{meta}</span>
    </div>
    {#if badge}
        <span class="badge {badgeVariant}">
            {badge}
        </span>
    {/if}
    {#if count}
        <div class="flex items-center gap-1 text-ink-3">
            <Users class="h-3 w-3" />
            <span class="text-xs">{count}</span>
        </div>
    {/if}
</a>
