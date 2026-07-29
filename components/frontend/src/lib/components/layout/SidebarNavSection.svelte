<script lang="ts">
    import { page } from '$app/stores';
    import type { ComponentType } from 'svelte';

    interface Item {
        label: string;
        icon: ComponentType;
        /** Omit for a "not available yet" stub entry. */
        href?: string;
    }

    let {
        label,
        items,
        collapsed,
        activeColor = 'primary',
    }: {
        label: string;
        items: Item[];
        collapsed: boolean;
        activeColor?: 'primary' | 'secondary' | 'tertiary';
    } = $props();

    const ACTIVE_CLASS = {
        primary: 'bg-surface-100-900 font-medium text-primary-700-300',
        secondary: 'bg-surface-100-900 font-medium text-secondary-700-300',
        tertiary: 'bg-surface-100-900 font-medium text-tertiary-700-300',
    };

    const LABEL_CLASS = {
        primary: 'text-surface-500',
        secondary: 'text-secondary-500',
        tertiary: 'text-tertiary-500',
    };

    // When multiple item hrefs prefix-match the current path (e.g. both
    // "/hackathons" and "/hackathons/new"), only the most specific one should
    // be highlighted.
    const activeHref = $derived.by(() => {
        const path = $page.url.pathname;
        let best: string | undefined;
        for (const item of items) {
            if (!item.href) continue;
            if (path === item.href || path.startsWith(item.href + '/')) {
                if (!best || item.href.length > best.length) best = item.href;
            }
        }
        return best;
    });
</script>

<div class="flex flex-col gap-0.5 border-t border-surface-200-800 p-2">
    {#if !collapsed}
        <span class="px-2 pb-1 text-xs font-bold tracking-widest {LABEL_CLASS[activeColor]}">
            {label}
        </span>
    {/if}
    <!-- Keyed on href, not label: page titles are user-supplied, so two pages
         named the same (or one named like a built-in entry) would be a duplicate
         key and take the entire sidebar down. Stub entries have no href, but
         their labels are hardcoded and unique. -->
    {#each items as item (item.href ?? item.label)}
        {@const Icon = item.icon}
        {@const isActive = item.href === activeHref}
        {#if item.href}
            <a
                href={item.href}
                title={collapsed ? item.label : undefined}
                class="flex h-10 items-center gap-2 rounded-lg px-2 text-sm no-underline
                       transition-colors
                       {isActive ? ACTIVE_CLASS[activeColor] : 'text-surface-500 hover:text-surface-700-300'}
                       {collapsed ? 'justify-center' : ''}"
            >
                <Icon class="h-4 w-4 shrink-0" />
                {#if !collapsed}
                    <span>{item.label}</span>
                {/if}
            </a>
        {:else}
            <span
                title="Not available yet"
                class="flex h-10 cursor-not-allowed items-center gap-2 rounded-lg px-2 text-sm
                       text-surface-500 opacity-50 {collapsed ? 'justify-center' : ''}"
            >
                <Icon class="h-4 w-4 shrink-0" />
                {#if !collapsed}
                    <span>{item.label}</span>
                {/if}
            </span>
        {/if}
    {/each}
</div>
