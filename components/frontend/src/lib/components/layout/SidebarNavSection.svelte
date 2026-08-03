<script lang="ts">
    import type { NavItem } from '$lib/navigation';

    let {
        label,
        badge,
        items,
        collapsed,
        activeId,
        accent = 'primary',
    }: {
        /** Omit where a heading would just repeat nearby context. */
        label?: string;
        /** Role chip beside the heading, e.g. "Owner". Hidden when collapsed. */
        badge?: string;
        items: NavItem[];
        collapsed: boolean;
        /** Computed once across all sections by the caller, so two sections can
         *  never both render as active. */
        activeId?: string;
        accent?: 'primary' | 'tertiary';
    } = $props();

    const ACTIVE_CLASS = {
        primary: 'bg-surface-100-900 font-medium text-primary-700-300',
        tertiary: 'bg-surface-100-900 font-medium text-tertiary-700-300',
    };

    const LABEL_CLASS = {
        primary: 'text-surface-500',
        tertiary: 'text-tertiary-500',
    };

    const BADGE_CLASS = {
        primary: 'preset-tonal-primary',
        tertiary: 'preset-tonal-tertiary',
    };

    // A section can be heading-only — an organiser has a role worth naming but
    // no pages to link to yet. Collapsed to the icon rail there is no heading to
    // show, so such a section would be an empty bordered strip: drop it instead.
    const hidden = $derived(items.length === 0 && (collapsed || !label));
</script>

{#if !hidden}
    <div class="flex flex-col gap-0.5 border-t border-surface-200-800 p-2">
        {#if label && !collapsed}
            <div class="flex items-baseline gap-2 px-2 pb-1">
                <span
                    class="min-w-0 truncate text-xs font-bold tracking-widest {LABEL_CLASS[accent]}"
                >
                    {label}
                </span>
                {#if badge}
                    <span
                        class="badge shrink-0 text-[0.625rem] {BADGE_CLASS[accent]}"
                    >
                        {badge}
                    </span>
                {/if}
            </div>
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
                           {isActive
                        ? ACTIVE_CLASS[accent]
                        : 'text-surface-500 hover:text-surface-700-300'}
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
{/if}
