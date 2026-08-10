<script lang="ts">
    import ChevronDown from 'lucide-svelte/icons/chevron-down';
    import type { NavItem } from '$lib/navigation/items';

    let {
        label,
        badge,
        parentItem,
        items,
        collapsed,
        activeId,
        accent = 'primary',
        folded = false,
        onToggleFold,
    }: {
        /** Omit where a heading would just repeat nearby context. */
        label?: string;
        /** Role chip beside the heading, e.g. "Owner". Hidden when collapsed. */
        badge?: string;
        /**
         * The entry the section is entered through: always drawn, and the row
         * carrying the disclosure for `items`. Without one this is a plain list.
         */
        parentItem?: NavItem;
        items: NavItem[];
        collapsed: boolean;
        /** Computed once across all sections by the caller, so two sections can
         *  never both render as active. */
        activeId?: string;
        accent?: 'primary' | 'tertiary';
        /** Hide `items` under the parent row. Ignored on the icon rail. */
        folded?: boolean;
        onToggleFold?: () => void;
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
    const empty = $derived(items.length === 0 && parentItem === undefined);
    const hidden = $derived(empty && (collapsed || !label));

    // Only folds where there is a parent row to fold into, and never on the icon
    // rail: no room for a chevron there, and entries hidden behind a control that
    // is not drawn are stranded.
    const foldable = $derived(parentItem !== undefined && items.length > 0 && !collapsed);
    const itemsHidden = $derived(foldable && folded);
</script>

{#snippet row(item: NavItem, extraClass = '')}
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
                   {isActive ? ACTIVE_CLASS[accent] : 'text-ink-3 hover:text-ink-2'}
                   {collapsed ? 'justify-center' : ''} {extraClass}"
        >
            <Icon class="h-4 w-4 shrink-0" />
            {#if !collapsed}
                <span class="min-w-0 truncate">{item.label}</span>
                <!-- A state chip on the entry, not a role chip: it says what this
                     destination is, so it keeps its own variant from the item
                     rather than the section's accent. On the collapsed rail there
                     is no room, and the item's icon carries the state instead. -->
                {#if item.badge}
                    <span class="badge ml-auto shrink-0 {item.badgeVariant ?? 'badge-neutral'}">
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
                   text-ink-3 opacity-50 {collapsed ? 'justify-center' : ''} {extraClass}"
        >
            <Icon class="h-4 w-4 shrink-0" />
            {#if !collapsed}
                <span class="truncate">{item.label}</span>
            {/if}
        </span>
    {/if}
{/snippet}

{#if !hidden}
    <div class="flex flex-col gap-0.5 border-t border-line p-2">
        {#if label && !collapsed}
            <div class="flex items-baseline gap-2 px-2 pb-1">
                <span class="meta min-w-0 truncate {LABEL_CLASS[accent]}">
                    {label}
                </span>
                {#if badge}
                    <span class="badge shrink-0 {BADGE_CLASS[accent]}">
                        {badge}
                    </span>
                {/if}
            </div>
        {/if}

        {#if parentItem}
            {#if foldable}
                <!-- Link and disclosure as siblings: the row is a page of its own,
                     and a button nested in an anchor is not clickable. -->
                <div class="flex items-center gap-0.5">
                    {@render row(parentItem, 'min-w-0 flex-1')}
                    <button
                        type="button"
                        onclick={onToggleFold}
                        aria-expanded={!folded}
                        aria-label={folded
                            ? `Show ${parentItem.label} pages`
                            : `Hide ${parentItem.label} pages`}
                        class="flex size-8 shrink-0 items-center justify-center rounded-control
                               text-ink-3 transition-colors hover:bg-raised hover:text-ink-2"
                    >
                        <ChevronDown
                            class="h-4 w-4 transition-transform {folded ? '-rotate-90' : ''}"
                            aria-hidden="true"
                        />
                    </button>
                </div>
            {:else}
                {@render row(parentItem)}
            {/if}
        {/if}

        {#if !itemsHidden}
            <!-- The hairline is what says these belong to the row above; a bare
                 left margin reads as stray alignment. Dropped on the icon rail,
                 where every row is centred and there is nothing to indent from. -->
            <div
                class="flex flex-col gap-0.5 {parentItem && !collapsed
                    ? 'ml-4 border-l border-line pl-1'
                    : ''}"
            >
                {#each items as item (item.id)}
                    {@render row(item)}
                {/each}
            </div>
        {/if}
    </div>
{/if}
