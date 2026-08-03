<script lang="ts">
    import type { NavItem } from '$lib/navigation';

    let {
        label,
        items,
        collapsed,
        activeId,
        activeColor = 'primary',
    }: {
        /** Omit where a heading would just repeat nearby context. */
        label?: string;
        items: NavItem[];
        collapsed: boolean;
        /** Computed once across all sections by the caller, so two sections can
         *  never both render as active. */
        activeId?: string;
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
</script>

<div class="flex flex-col gap-0.5 border-t border-surface-200-800 p-2">
    {#if label && !collapsed}
        <span class="px-2 pb-1 text-xs font-bold tracking-widest {LABEL_CLASS[activeColor]}">
            {label}
        </span>
    {/if}
    {#each items as item (item.id)}
        {@const Icon = item.icon}
        {@const isActive = item.id === activeId}
        {#if item.href}
            <!-- eslint-disable svelte/no-navigation-without-resolve -- these hrefs are
                 built with resolve() in $lib/navigation; the rule only recognizes a
                 literal resolve() call in the attribute itself. -->
            <a
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                class="flex h-10 items-center gap-2 rounded-lg px-2 text-sm no-underline
                       transition-colors
                       {isActive ? ACTIVE_CLASS[activeColor] : 'text-surface-500 hover:text-surface-700-300'}
                       {collapsed ? 'justify-center' : ''}"
            >
                <Icon class="h-4 w-4 shrink-0" />
                {#if !collapsed}
                    <span class="truncate">{item.label}</span>
                {/if}
            </a>
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
        {:else}
            <span
                title="Not available yet"
                class="flex h-10 cursor-not-allowed items-center gap-2 rounded-lg px-2 text-sm
                       text-surface-500 opacity-50 {collapsed ? 'justify-center' : ''}"
            >
                <Icon class="h-4 w-4 shrink-0" />
                {#if !collapsed}
                    <span class="truncate">{item.label}</span>
                {/if}
            </span>
        {/if}
    {/each}
</div>
