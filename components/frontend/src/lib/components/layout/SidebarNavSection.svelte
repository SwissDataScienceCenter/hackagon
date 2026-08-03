<script lang="ts">
    import type { ComponentType } from 'svelte';
    import type { NavItem } from '$lib/navigation';

    let {
        label,
        items,
        collapsed,
        activeId,
        activeColor = 'primary',
        markerIcon,
        titlePrefix,
    }: {
        /** Omit where a heading would just repeat nearby context. */
        label?: string;
        items: NavItem[];
        collapsed: boolean;
        /** Computed once across all sections by the caller, so two sections can
         *  never both render as active. */
        activeId?: string;
        activeColor?: 'primary' | 'secondary' | 'tertiary';
        /** Stands in for the hidden heading on the collapsed rail. Pass one where
         *  the section's icons repeat another section's — the divider alone says
         *  "a new section", not which one. */
        markerIcon?: ComponentType;
        /** Disambiguates collapsed tooltips, e.g. "Manage · Participants". With
         *  no visible label the tooltip is also the link's accessible name, so
         *  three sections owning a Users icon otherwise read identically. */
        titlePrefix?: string;
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

    // Only on the rail: expanded, the heading above already says which section
    // this is, and repeating it in every tooltip is noise.
    function tooltip(item: NavItem): string | undefined {
        if (!collapsed) return undefined;

        return titlePrefix ? `${titlePrefix} · ${item.label}` : item.label;
    }
</script>

<div class="flex flex-col gap-0.5 border-t border-surface-200-800 p-2">
    {#if label && !collapsed}
        <span class="px-2 pb-1 text-xs font-bold tracking-widest {LABEL_CLASS[activeColor]}">
            {label}
        </span>
    {:else if collapsed && markerIcon}
        {@const Marker = markerIcon}
        <!-- aria-hidden: the tooltips below already carry the section into each
             link's accessible name, so this would only repeat it. -->
        <span
            title={label}
            aria-hidden="true"
            class="flex h-6 items-center justify-center {LABEL_CLASS[activeColor]}"
        >
            <Marker class="h-3.5 w-3.5 shrink-0" />
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
                title={tooltip(item)}
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
