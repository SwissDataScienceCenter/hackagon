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
        primary: 'bg-raised font-medium text-accent-ink',
        tertiary: 'bg-raised font-medium text-info-ink',
    };

    // Only the tertiary heading departs from `.meta`'s own ink-3; primary would
    // just restate it.
    const LABEL_CLASS = {
        primary: '',
        tertiary: 'text-info-ink',
    };

    const BADGE_CLASS = {
        primary: 'badge-accent',
        tertiary: 'badge-info',
    };

    // A section can be heading-only — an organiser has a role worth naming but
    // no pages to link to yet. Collapsed to the icon rail there is no heading to
    // show, so such a section would be an empty bordered strip: drop it instead.
    const hidden = $derived(items.length === 0 && (collapsed || !label));
</script>

{#if !hidden}
    <div class="flex flex-col gap-0.5 border-t border-line p-2">
        {#if label && !collapsed}
            <div class="flex items-baseline gap-2 px-2 pb-1">
                <span
                    class="meta min-w-0 truncate {LABEL_CLASS[accent]}"
                >
                    {label}
                </span>
                {#if badge}
                    <span
                        class="badge shrink-0 {BADGE_CLASS[accent]}"
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
                    class="flex h-10 items-center gap-2 rounded-control px-2 text-sm no-underline
                           transition-colors
                           {isActive
                        ? ACTIVE_CLASS[accent]
                        : 'text-ink-3 hover:text-ink-2'}
                           {collapsed ? 'justify-center' : ''}"
                >
                    <Icon class="h-4 w-4 shrink-0" />
                    {#if !collapsed}
                        <span class="min-w-0 truncate">{item.label}</span>
                        <!-- A state chip on the entry, not a role chip: it says
                             what this destination is, so it keeps its own variant
                             from the item rather than the section's accent. On the
                             collapsed rail there is no room, and the item's icon
                             carries the state instead. -->
                        {#if item.badge}
                            <span
                                class="badge ml-auto shrink-0 {item.badgeVariant ??
                                    'badge-neutral'}"
                            >
                                {item.badge}
                            </span>
                        {/if}
                    {/if}
                </a>
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
            {:else}
                <span
                    title="Not available yet"
                    class="flex h-10 cursor-not-allowed items-center gap-2 rounded-control px-2 text-sm
                           text-ink-3 opacity-50 {collapsed ? 'justify-center' : ''}"
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
