<script lang="ts">
    import { resolve } from '$app/paths';
    import { Users } from 'lucide-svelte';

    let {
        href,
        name,
        org,
        meta,
        badge,
        badgePreset = 'preset-tonal-primary',
        // A second badge (e.g. the viewer's membership). Kept here rather than
        // rendered by the caller alongside the row, so both badges share one
        // group and move below the title together on phones.
        extraBadge,
        extraBadgePreset = 'preset-tonal',
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
        badgePreset?: string;
        extraBadge?: string;
        extraBadgePreset?: string;
        count?: string;
        gradFrom: string;
        gradTo: string;
        size?: 'default' | 'compact';
    } = $props();

    const thumbSize = size === 'compact' ? 'h-9 w-9' : 'h-12 w-12';
    // A MINIMUM, never a fixed height: a long event name wraps to three lines
    // on a phone, and a fixed box clipped the title and collided with whatever
    // sat above the row.
    const rowHeight = size === 'compact' ? 'min-h-14' : 'min-h-[72px]';
    // Indent the badges under the text on phones, where they sit below the
    // title rather than beside it (thumbnail width + gap).
    const badgeIndent = size === 'compact' ? 'pl-13' : 'pl-16';
</script>

<a
    href={resolve(href)}
    class="flex {rowHeight} flex-col gap-2 px-4 py-3 no-underline transition-colors
           hover:bg-surface-100-900 sm:flex-row sm:items-center sm:gap-4 sm:py-0"
>
    <div class="flex min-w-0 flex-1 items-center gap-4">
        <div
            class="{thumbSize} shrink-0"
            style="background: linear-gradient(135deg, {gradFrom}, {gradTo})"
        ></div>
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <div class="flex flex-wrap items-baseline gap-x-2">
                {#if org}
                    <span class="text-sm text-surface-500">{org}</span>
                    <span class="text-sm text-surface-400">/</span>
                {/if}
                <!-- Event names are long and unbroken; without this a single
                     word can push the row wider than the viewport. -->
                <span class="text-sm font-semibold break-words">{name}</span>
            </div>
            <span class="text-xs text-surface-500">{meta}</span>
        </div>
    </div>

    {#if badge || extraBadge || count}
        <!-- Below the title on phones, beside it from sm up. -->
        <div class="flex shrink-0 flex-wrap items-center gap-2 {badgeIndent} sm:pl-0">
            {#if badge}
                <span class="badge {badgePreset}">{badge}</span>
            {/if}
            {#if extraBadge}
                <span class="badge {extraBadgePreset}">{extraBadge}</span>
            {/if}
            {#if count}
                <div class="flex items-center gap-1 text-surface-500">
                    <Users class="h-3 w-3" />
                    <span class="text-xs">{count}</span>
                </div>
            {/if}
        </div>
    {/if}
</a>
